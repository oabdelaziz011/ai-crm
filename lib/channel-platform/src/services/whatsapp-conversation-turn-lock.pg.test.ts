/**
 * Two independent processes compete for one WhatsApp turn lease on local Postgres.
 * Uses only whatsapp_conversation_turn_leases. Does not read or update existing messages.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const require = createRequire(path.join(repoRoot, "lib/db/package.json"));
const pg = require("pg");

function localStackEnvPath(): string {
  return path.join(repoRoot, ".env.localstack");
}

function hasLocalStackEnv(): boolean {
  return fs.existsSync(localStackEnvPath());
}

function localEnv(name: string): string {
  const text = fs.readFileSync(localStackEnvPath(), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(`${name}=`)) continue;
    return trimmed.slice(name.length + 1);
  }
  throw new Error(`Missing ${name} in local stack env`);
}

function localDatabaseUrl(): string {
  const databaseUrl = localEnv("DATABASE_URL");
  const parsed = new URL(databaseUrl);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "54322") {
    throw new Error(`Refusing database host ${parsed.hostname}:${parsed.port}`);
  }
  return databaseUrl;
}

function localSupabaseUrl(): string {
  const supabaseUrl = localEnv("SUPABASE_URL");
  const parsed = new URL(supabaseUrl);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "54321") {
    throw new Error(`Refusing Supabase host ${parsed.hostname}:${parsed.port}`);
  }
  return supabaseUrl;
}

function redact(text: string): string {
  return text
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]")
    .slice(0, 240);
}

async function postgrestRpc(
  keyName: "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_ANON_KEY",
  fn: string,
  body: Record<string, unknown>,
): Promise<{ status: number; value: unknown }> {
  const key = localEnv(keyName);
  const response = await fetch(`${localSupabaseUrl()}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let value: unknown = text;
  try {
    value = JSON.parse(text);
  } catch {
    value = redact(text);
  }
  if (response.status !== 200 && response.status !== 401 && response.status !== 403 && response.status !== 404) {
    throw new Error(`PostgREST ${fn} status ${response.status}: ${redact(text)}`);
  }
  return { status: response.status, value };
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redact(message);
}

async function withLocalClient<T>(run: (client: { query: Function; end: () => Promise<void> }) => Promise<T>): Promise<T> {
  const client = new pg.Client({
    connectionString: localDatabaseUrl(),
    connectionTimeoutMillis: 5000,
    statement_timeout: 20000,
  });
  await client.connect();
  const identity = await client.query(
    "select inet_server_addr()::text as addr, inet_server_port()::int as port",
  );
  const addr = String(identity.rows[0].addr ?? "");
  const port = Number(identity.rows[0].port);
  const local =
    !addr ||
    addr.startsWith("127.0.0.1") ||
    addr.startsWith("172.") ||
    addr.startsWith("10.") ||
    addr.startsWith("192.168.");
  if (!local || (port !== 54322 && port !== 5432)) {
    await client.end();
    throw new Error(`Refusing Postgres ${addr}:${port}`);
  }
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function applyMigration(): Promise<void> {
  const sql = fs.readFileSync(
    path.join(repoRoot, "supabase/migrations/433_whatsapp_conversation_turn_lease.sql"),
    "utf8",
  );
  await withLocalClient(async (client) => {
    await client.query(sql);
  });
}

function callLock(
  op: "acquire" | "renew" | "release",
  conversationId: string,
  owner: string,
  ttlMs = 5_000,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx/esm", fileURLToPath(import.meta.url), "child", op, conversationId, owner, String(ttlMs)],
      {
        cwd: path.join(repoRoot, "lib/channel-platform"),
        env: { ...process.env, DATABASE_URL: localDatabaseUrl() },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(safeError(stderr || `lock child exited ${code}`)));
        return;
      }
      const line = stdout.trim().split(/\r?\n/).pop() ?? "";
      resolve(JSON.parse(line).ok === true);
    });
  });
}

async function childMain(): Promise<void> {
  const [, , , op, conversationId, owner, ttlMs] = process.argv;
  if (op !== "acquire" && op !== "renew" && op !== "release") {
    throw new Error("unsupported lock operation");
  }
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const ttl = Number(ttlMs);
    const query =
      op === "release"
        ? {
            text: "select public.release_whatsapp_conversation_turn($1::uuid, $2) as ok",
            values: [conversationId, owner],
          }
        : {
            text: `select public.${op}_whatsapp_conversation_turn($1::uuid, $2, $3) as ok`,
            values: [conversationId, owner, ttl],
          };
    const result = await client.query(query);
    process.stdout.write(`${JSON.stringify({ ok: result.rows[0].ok === true })}\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[2] === "child") {
  childMain().catch((error) => {
    process.stderr.write(`${safeError(error)}\n`);
    process.exit(1);
  });
} else {
  const skipWithoutLocalStack = hasLocalStackEnv()
    ? false
    : ".env.localstack is required for local Postgres lease tests (skipped in CI/clean checkouts)";

  describe("whatsapp conversation turn lease on local postgres", { concurrency: 1, skip: skipWithoutLocalStack }, () => {
    const conversations: string[] = [];

    it("two processes cannot own the same conversation, and a stale owner cannot renew or release", async () => {
      await applyMigration();
      const conversationId = randomUUID();
      conversations.push(conversationId);
      const ownerA = `owner-${randomUUID()}`;
      const ownerB = `owner-${randomUUID()}`;

      const [first, second] = await Promise.all([
        callLock("acquire", conversationId, ownerA, 120_000),
        callLock("acquire", conversationId, ownerB, 120_000),
      ]);
      const wins = [first, second].filter(Boolean).length;
      assert.equal(wins, 1);
      const winner = first ? ownerA : ownerB;
      const loser = first ? ownerB : ownerA;
      assert.equal(await callLock("renew", conversationId, loser, 5_000), false);
      assert.equal(await callLock("release", conversationId, loser), false);
      assert.equal(await callLock("renew", conversationId, winner, 5_000), true);
      assert.equal(await callLock("release", conversationId, winner), true);
      assert.equal(await callLock("acquire", conversationId, loser, 5_000), true);
      assert.equal(await callLock("release", conversationId, loser), true);
    });

    it("lets another process acquire after expiry and rejects the old owner", async () => {
      const conversationId = randomUUID();
      conversations.push(conversationId);
      const ownerA = `owner-${randomUUID()}`;
      const ownerB = `owner-${randomUUID()}`;
      assert.equal(await callLock("acquire", conversationId, ownerA, 200), true);
      await new Promise((resolve) => setTimeout(resolve, 350));
      assert.equal(await callLock("renew", conversationId, ownerA, 5_000), false);
      assert.equal(await callLock("acquire", conversationId, ownerB, 5_000), true);
      assert.equal(await callLock("release", conversationId, ownerA), false);
      assert.equal(await callLock("renew", conversationId, ownerB, 5_000), true);
      assert.equal(await callLock("release", conversationId, ownerB), true);
    });

    it("service role acquires through the local API and anon cannot", async () => {
      await applyMigration();
      const conversationId = randomUUID();
      conversations.push(conversationId);
      const ownerA = `owner-${randomUUID()}`;
      const ownerB = `owner-${randomUUID()}`;
      const args = (owner: string, ttlMs: number) => ({
        p_conversation_id: conversationId,
        p_owner: owner,
        p_ttl_ms: ttlMs,
      });

      const anon = await postgrestRpc("SUPABASE_ANON_KEY", "acquire_whatsapp_conversation_turn", args(ownerA, 5_000));
      assert.notEqual(anon.status, 200);

      const first = await postgrestRpc("SUPABASE_SERVICE_ROLE_KEY", "acquire_whatsapp_conversation_turn", args(ownerA, 120_000));
      assert.equal(first.status, 200);
      assert.equal(first.value, true);
      const second = await postgrestRpc("SUPABASE_SERVICE_ROLE_KEY", "acquire_whatsapp_conversation_turn", args(ownerB, 120_000));
      assert.equal(second.status, 200);
      assert.equal(second.value, false);
      const loserRenew = await postgrestRpc("SUPABASE_SERVICE_ROLE_KEY", "renew_whatsapp_conversation_turn", args(ownerB, 5_000));
      assert.equal(loserRenew.value, false);
      const winnerRenew = await postgrestRpc("SUPABASE_SERVICE_ROLE_KEY", "renew_whatsapp_conversation_turn", args(ownerA, 5_000));
      assert.equal(winnerRenew.value, true);
      const loserRelease = await postgrestRpc("SUPABASE_SERVICE_ROLE_KEY", "release_whatsapp_conversation_turn", {
        p_conversation_id: conversationId,
        p_owner: ownerB,
      });
      assert.equal(loserRelease.value, false);
      const winnerRelease = await postgrestRpc("SUPABASE_SERVICE_ROLE_KEY", "release_whatsapp_conversation_turn", {
        p_conversation_id: conversationId,
        p_owner: ownerA,
      });
      assert.equal(winnerRelease.value, true);
    });

    it("removes only the test leases", async () => {
      await withLocalClient(async (client) => {
        if (conversations.length === 0) return;
        await client.query(
          "delete from public.whatsapp_conversation_turn_leases where conversation_id = any($1::uuid[])",
          [conversations],
        );
        const left = await client.query(
          "select count(*)::int as n from public.whatsapp_conversation_turn_leases where conversation_id = any($1::uuid[])",
          [conversations],
        );
        assert.equal(left.rows[0].n, 0);
      });
    });
  });
}
