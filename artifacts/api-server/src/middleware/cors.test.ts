import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import express, { Router, type Express } from "express";
import { applySecurityMiddleware } from "./security.js";
import { errorHandler } from "./error-handler.js";
import { requireCompanyScope, requireSupabaseAuth } from "./supabase-auth.js";
import {
  apiCorsMiddleware,
  isAllowedCorsOrigin,
  normalizeCorsOrigin,
  parseCorsOriginList,
  resolveApiCorsAllowedOrigins,
} from "./cors.js";

const PRODUCTION_FRONTEND_ORIGIN = "https://app.valueor.org";
const HEALTH_PATH = "/api/instagram/channel-outbound-health";
const here = dirname(fileURLToPath(import.meta.url));

function createCorsTestApp(): Express {
  const app = express();
  app.use(apiCorsMiddleware);
  applySecurityMiddleware(app);
  app.use(express.json());

  const router = Router();
  router.use(requireSupabaseAuth);
  router.use(requireCompanyScope("companyId"));
  router.post("/instagram/channel-outbound-health", (_req, res) => {
    res.status(200).json({ ok: true, reachedHandler: true });
  });
  app.use("/api", router);
  app.use(errorHandler);
  return app;
}

async function listen(app: Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      }),
  };
}

describe("API CORS origin parsing", () => {
  it("strips trailing slashes and whitespace", () => {
    assert.equal(normalizeCorsOrigin(" https://app.valueor.org/ "), PRODUCTION_FRONTEND_ORIGIN);
    assert.equal(normalizeCorsOrigin("http://localhost:5173///"), "http://localhost:5173");
  });

  it("splits comma-separated origin configuration", () => {
    assert.deepEqual(
      parseCorsOriginList("https://app.valueor.org/, http://localhost:5173/ ,"),
      [PRODUCTION_FRONTEND_ORIGIN, "http://localhost:5173"],
    );
  });

  it("always includes production and local frontend origins", () => {
    const origins = resolveApiCorsAllowedOrigins({});
    assert.ok(origins.includes(PRODUCTION_FRONTEND_ORIGIN));
    assert.ok(origins.includes("http://localhost:5173"));
    assert.ok(origins.includes("http://127.0.0.1:5173"));
  });

  it("merges FRONTEND_ORIGIN / CORS_ALLOWED_ORIGINS without duplicating slashes", () => {
    const origins = resolveApiCorsAllowedOrigins({
      FRONTEND_ORIGIN: "https://app.valueor.org/",
      CORS_ALLOWED_ORIGINS: "https://staging.valueor.org/,https://app.valueor.org",
      VITE_APP_ORIGIN: "https://preview.example.test/",
    });
    assert.ok(origins.includes(PRODUCTION_FRONTEND_ORIGIN));
    assert.ok(origins.includes("https://staging.valueor.org"));
    assert.ok(origins.includes("https://preview.example.test"));
    assert.equal(origins.filter((origin) => origin === PRODUCTION_FRONTEND_ORIGIN).length, 1);
    assert.equal(origins.some((origin) => origin.endsWith("/")), false);
  });

  it("rejects untrusted origins", () => {
    const allowed = resolveApiCorsAllowedOrigins({});
    assert.equal(isAllowedCorsOrigin("https://evil.example", allowed), false);
    assert.equal(isAllowedCorsOrigin(undefined, allowed), false);
    assert.equal(isAllowedCorsOrigin(`${PRODUCTION_FRONTEND_ORIGIN}/`, allowed), true);
  });
});

describe("API CORS preflight and Instagram health route protection", () => {
  let baseUrl = "";
  let close: () => Promise<void> = async () => undefined;

  before(async () => {
    const app = createCorsTestApp();
    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    close = listening.close;
  });

  after(async () => {
    await close();
  });

  it("allows production frontend preflight for Instagram outbound health", async () => {
    const response = await fetch(`${baseUrl}${HEALTH_PATH}`, {
      method: "OPTIONS",
      headers: {
        Origin: PRODUCTION_FRONTEND_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), PRODUCTION_FRONTEND_ORIGIN);
    assert.match(response.headers.get("access-control-allow-methods") ?? "", /POST/i);
    assert.match(response.headers.get("access-control-allow-headers") ?? "", /authorization/i);
    assert.match(response.headers.get("access-control-allow-headers") ?? "", /content-type/i);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
    assert.notEqual(response.headers.get("access-control-allow-origin"), "*");
  });

  it("allows localhost frontend origin preflight", async () => {
    const response = await fetch(`${baseUrl}${HEALTH_PATH}`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  });

  it("does not allow an untrusted origin", async () => {
    const response = await fetch(`${baseUrl}${HEALTH_PATH}`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  });

  it("reflects a trailing-slash production origin without emitting the slash", async () => {
    const response = await fetch(`${baseUrl}${HEALTH_PATH}`, {
      method: "OPTIONS",
      headers: {
        Origin: `${PRODUCTION_FRONTEND_ORIGIN}/`,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), PRODUCTION_FRONTEND_ORIGIN);
  });

  it("keeps POST /api/instagram/channel-outbound-health authenticated", async () => {
    const response = await fetch(`${baseUrl}${HEALTH_PATH}`, {
      method: "POST",
      headers: {
        Origin: PRODUCTION_FRONTEND_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ companyId: "co-1", companyChannelId: "ch-1" }),
    });

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("access-control-allow-origin"), PRODUCTION_FRONTEND_ORIGIN);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
    const payload = (await response.json()) as { error?: string; reachedHandler?: boolean };
    assert.equal(payload.error, "unauthorized");
    assert.notEqual(payload.reachedHandler, true);
  });
});

describe("Instagram outbound health auth contract", () => {
  it("still requires supabase auth and company scope before the health handler", () => {
    const source = readFileSync(resolve(here, "../routes/instagram.ts"), "utf8");
    const authIndex = source.indexOf("router.use(requireSupabaseAuth)");
    const scopeIndex = source.indexOf('router.use(requireCompanyScope("companyId"))');
    const handlerIndex = source.indexOf('router.post("/instagram/channel-outbound-health"');
    assert.ok(authIndex >= 0);
    assert.ok(scopeIndex > authIndex);
    assert.ok(handlerIndex > scopeIndex);
  });
});
