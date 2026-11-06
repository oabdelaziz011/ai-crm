import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, before, after } from "node:test";
import express from "express";
import { applySharedBodyParsers } from "./http/body-limits.js";
import { createApiSessionMiddleware } from "./session/create-api-session.js";
import { PostgresSessionStore } from "./session/postgres-session-store.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const require = createRequire(resolve(root, "lib/db/package.json"));
const pg = require("pg") as typeof import("pg");

const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const table = "api_runtime_test.express_sessions";

function assertLoopback(url: string): void {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("Session store tests refuse a non-loopback database.");
  }
}

function cookiePair(setCookie: string | null): string {
  const first = setCookie?.split(";")[0] ?? "";
  assert.ok(first.startsWith("connect.sid="), "session cookie missing");
  return first;
}

async function request(
  port: number,
  method: string,
  path: string,
  body?: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; setCookie: string; text: string }> {
  const payload = body ?? "";
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      "x-forwarded-proto": "https",
      ...(payload ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: payload || undefined,
  });
  const setCookie = response.headers.getSetCookie?.().join(",") ?? response.headers.get("set-cookie") ?? "";
  return { status: response.status, setCookie, text: await response.text() };
}

function listen(app: express.Express): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolveListen, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Test server did not bind a port."));
        return;
      }
      resolveListen({
        port: address.port,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}

function sessionApp(store: PostgresSessionStore): express.Express {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(
    createApiSessionMiddleware({
      nodeEnv: "production",
      sessionSecret: "synthetic-session-value",
      store,
    }),
  );
  app.post("/login", (req, res) => {
    req.session.userId = Number(req.body.userId);
    res.json({ userId: req.session.userId });
  });
  app.post("/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
  app.get("/me", (req, res) => {
    res.json({ userId: req.session.userId ?? null });
  });
  return app;
}

describe("PostgreSQL session store", () => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
  let store: PostgresSessionStore;

  before(async () => {
    assertLoopback(databaseUrl);
    await pool.query("create schema if not exists api_runtime_test");
    await pool.query(`
      create table if not exists ${table} (
        sid text primary key,
        sess jsonb not null,
        expire timestamptz not null
      )
    `);
    await pool.query(`truncate ${table}`);
    store = new PostgresSessionStore(pool, { table, pruneIntervalMs: 60_000 });
  });

  after(async () => {
    store?.stop();
    await pool.query("drop schema if exists api_runtime_test cascade");
    await pool.end();
  });

  it("refuses the in-memory store in production and keeps the cookie flags", () => {
    assert.throws(
      () => createApiSessionMiddleware({ nodeEnv: "production", sessionSecret: "synthetic-session-value" }),
      /PostgreSQL session store/,
    );
    const source = readFileSync(resolve(here, "session/create-api-session.ts"), "utf8");
    assert.match(source, /sameSite: "lax"/);
    assert.match(source, /httpOnly: true/);
    assert.match(source, /secure: production/);
    assert.match(source, /maxAge: SEVEN_DAYS_MS/);
    assert.doesNotMatch(source, /new session\.MemoryStore|MemoryStore\(/);
    const migration = readFileSync(resolve(root, "supabase/migrations/443_api_runtime_express_sessions.sql"), "utf8");
    assert.match(migration, /enable row level security/);
    assert.match(migration, /revoke all on table api_runtime\.express_sessions from anon/);
    assert.match(migration, /revoke all on table api_runtime\.express_sessions from authenticated/);
    assert.match(migration, /revoke all on table api_runtime\.express_sessions from service_role/);
    assert.doesNotMatch(migration, /grant .+ to anon|grant .+ to authenticated|grant .+ to service_role/i);
    assert.match(migration, /drop schema if exists api_runtime cascade/);
    const startApi = readFileSync(resolve(root, "deploy/vps/start-api.mjs"), "utf8");
    assert.doesNotMatch(startApi, /--enable-source-maps/);
    assert.match(startApi, /artifacts\/api-server\/dist\/main\.mjs/);
  });

  it("keeps a session across a new store instance and drops it on logout", async () => {
    const first = sessionApp(store);
    const started = await listen(first);
    const login = await request(started.port, "POST", "/login", JSON.stringify({ userId: 42 }));
    assert.equal(login.status, 200);
    const cookie = cookiePair(login.setCookie);
    assert.match(login.setCookie, /HttpOnly/i);
    assert.match(login.setCookie, /Secure/i);
    assert.match(login.setCookie, /SameSite=Lax/i);
    const expiresAt = new Date(/Expires=([^;]+)/i.exec(login.setCookie)?.[1] ?? "");
    const remainingMs = expiresAt.getTime() - Date.now();
    assert.ok(remainingMs > 6.9 * 24 * 60 * 60 * 1000);
    assert.ok(remainingMs < 7.1 * 24 * 60 * 60 * 1000);
    await started.close();

    const restarted = new PostgresSessionStore(pool, { table, pruneIntervalMs: 60_000 });
    const second = sessionApp(restarted);
    const again = await listen(second);
    const me = await request(again.port, "GET", "/me", undefined, { cookie });
    assert.deepEqual(JSON.parse(me.text), { userId: 42 });
    const row = await pool.query(`select sess from ${table}`);
    const saved = row.rows[0]?.sess as { userId?: number; companyId?: unknown };
    assert.equal(saved.userId, 42);
    assert.equal(saved.companyId, undefined);

    const logout = await request(again.port, "POST", "/logout", "{}", { cookie });
    assert.equal(logout.status, 200);
    const after = await request(again.port, "GET", "/me", undefined, { cookie });
    assert.deepEqual(JSON.parse(after.text), { userId: null });
    restarted.stop();
    await again.close();
  });

  it("isolates concurrent sessions", async () => {
    const app = sessionApp(store);
    const started = await listen(app);
    const responses = await Promise.all(
      [1, 2, 3, 4, 5, 6, 7, 8].map((userId) =>
        request(started.port, "POST", "/login", JSON.stringify({ userId })),
      ),
    );
    const cookies = responses.map((response) => cookiePair(response.setCookie));
    assert.equal(new Set(cookies).size, cookies.length);
    const reads = await Promise.all(
      cookies.map((cookie) => request(started.port, "GET", "/me", undefined, { cookie })),
    );
    const ids = reads.map((response) => JSON.parse(response.text).userId as number).sort((a, b) => a - b);
    assert.deepEqual(ids, [1, 2, 3, 4, 5, 6, 7, 8]);
    await started.close();
  });

  it("removes expired rows", async () => {
    await pool.query(
      `insert into ${table} (sid, sess, expire) values ($1, $2::jsonb, now() - interval '1 minute')
       on conflict (sid) do update set expire = excluded.expire`,
      ["expired-sid", JSON.stringify({ userId: 9, cookie: {} })],
    );
    await store.pruneExpired();
    const left = await pool.query(`select sid from ${table} where sid = $1`, ["expired-sid"]);
    assert.equal(left.rowCount, 0);
  });
});

describe("API body limits", () => {
  it("accepts a customer import payload and rejects an oversized ordinary JSON body", async () => {
    const app = express();
    applySharedBodyParsers(app);
    app.post("/api/customers/import/jobs", (req, res) => {
      const fileBase64 = (req.body as { fileBase64?: string } | undefined)?.fileBase64 ?? "";
      res.json({ bytes: fileBase64.length });
    });
    app.post("/api/notes", (_req, res) => {
      res.json({ ok: true });
    });
    app.use((error: { status?: number; statusCode?: number }, _req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
      const status = error.status ?? error.statusCode;
      if (!status) {
        next(error);
        return;
      }
      res.statusCode = status;
      res.end();
    });
    const started = await listen(app);
    const small = await request(started.port, "POST", "/api/notes", JSON.stringify({ note: "hello" }));
    assert.equal(small.status, 200);
    const oversized = "x".repeat(1_200_000);
    const tooBig = await request(started.port, "POST", "/api/notes", JSON.stringify({ note: oversized }));
    assert.equal(tooBig.status, 413);
    const file = "y".repeat(6 * 1024 * 1024);
    const imported = await request(
      started.port,
      "POST",
      "/api/customers/import/jobs",
      JSON.stringify({ fileBase64: file }),
    );
    assert.equal(imported.status, 200);
    assert.equal(JSON.parse(imported.text).bytes, file.length);
    await started.close();
  });
});
