import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express from "express";
import { apiCorsMiddleware } from "../middleware/cors.js";
import { PUBLIC_WEB_CHAT_ROUTE_PREFIX } from "../services/public-web-chat/public-web-chat-config.js";
import type { PublicWebChatService } from "../services/public-web-chat/public-web-chat-service.js";
import { createPublicWebChatRouter } from "./public-web-chat-router.js";

const ALLOWED = "https://shop.example.com";
const SESSION_ID = "6f1c2f55-6c55-4d4e-9d5b-0d7d8f3b8a11";
const TOKEN = `wct_${"A".repeat(43)}`;
const KEY = `wcw_${"a".repeat(48)}`;

type Call = { method: string; input: Record<string, unknown> };

function createFakeService(calls: Call[]): PublicWebChatService {
  const originOk = (origin: unknown) => origin === ALLOWED;
  return {
    async preflightOrigin(input) {
      calls.push({ method: "preflight", input: input as Record<string, unknown> });
      return originOk(input.origin) ? ALLOWED : null;
    },
    async createSession(input) {
      calls.push({ method: "createSession", input: input as unknown as Record<string, unknown> });
      if (!originOk(input.origin)) return { ok: false, status: 404, error: "web_chat_unavailable" };
      return { ok: true, status: 201, body: { session: { id: SESSION_ID }, visitorToken: TOKEN } };
    },
    async sendMessage(input) {
      calls.push({ method: "sendMessage", input: input as unknown as Record<string, unknown> });
      if (input.token !== TOKEN || !originOk(input.origin)) {
        return { ok: false, status: 404, error: "web_chat_unavailable" };
      }
      if (input.body.text === "boom") throw new Error("relation \"conversations\" does not exist at pg");
      return { ok: true, status: 200, body: { status: "replied", clientMessageId: input.body.client_message_id } };
    },
    async listMessages(input) {
      calls.push({ method: "listMessages", input: input as unknown as Record<string, unknown> });
      if (input.token !== TOKEN) return { ok: false, status: 404, error: "web_chat_unavailable" };
      return { ok: true, status: 200, body: { messages: [], nextAfter: 0 } };
    },
  };
}

describe("Public Web Chat HTTP router", () => {
  const calls: Call[] = [];
  let apiEnabled = true;
  let baseUrl = "";
  let server: ReturnType<express.Express["listen"]>;

  before(async () => {
    const app = express();
    app.use(apiCorsMiddleware);
    app.use(
      PUBLIC_WEB_CHAT_ROUTE_PREFIX,
      createPublicWebChatRouter({ resolveService: () => createFakeService(calls), isApiEnabled: () => apiEnabled }),
    );
    app.get("/api/dashboard-probe", (_req, res) => {
      res.json({ ok: true });
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const url = (path: string) => `${baseUrl}${PUBLIC_WEB_CHAT_ROUTE_PREFIX}${path}`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(url(path), {
      method: "POST",
      headers: { "content-type": "application/json", origin: ALLOWED, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("37. preflight: allowed origin reflected exactly, never '*', no credentials", async () => {
    const res = await fetch(url(`/${KEY}/sessions`), {
      method: "OPTIONS",
      headers: { origin: ALLOWED, "access-control-request-method": "POST" },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED);
    assert.equal(res.headers.get("access-control-allow-credentials"), null);
    assert.equal(res.headers.get("access-control-allow-methods"), "POST");
    assert.match(res.headers.get("vary") ?? "", /Origin/);
  });

  it("37. preflight: disallowed origin gets a neutral 404 without ACAO (dashboard CORS not applied)", async () => {
    for (const origin of ["https://evil.example.com", "http://localhost:5173", "https://app.valueor.org"]) {
      const res = await fetch(url(`/sessions/${SESSION_ID}/messages`), {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "POST" },
      });
      assert.equal(res.status, 404, origin);
      assert.equal(res.headers.get("access-control-allow-origin"), null, origin);
      assert.equal(res.headers.get("access-control-allow-credentials"), null, origin);
    }
  });

  it("dashboard /api CORS is unchanged (credentials allowlist still applies)", async () => {
    const res = await fetch(`${baseUrl}/api/dashboard-probe`, { headers: { origin: "https://app.valueor.org" } });
    assert.equal(res.headers.get("access-control-allow-origin"), "https://app.valueor.org");
    assert.equal(res.headers.get("access-control-allow-credentials"), "true");
    const preflight = await fetch(`${baseUrl}/api/anything`, {
      method: "OPTIONS",
      headers: { origin: "https://app.valueor.org" },
    });
    assert.equal(preflight.status, 204);
  });

  it("session create reflects ACAO only on success; no-store cache", async () => {
    const ok = await post(`/${KEY}/sessions`, {});
    assert.equal(ok.status, 201);
    assert.equal(ok.headers.get("access-control-allow-origin"), ALLOWED);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    const bad = await post(`/${KEY}/sessions`, {}, { origin: "https://evil.example.com" });
    assert.equal(bad.status, 404);
    assert.equal(bad.headers.get("access-control-allow-origin"), null);
    assert.deepEqual(await bad.json(), { error: "web_chat_unavailable", message: "Chat is unavailable right now." });
  });

  it("visitor token is read only from the Authorization bearer header", async () => {
    const noHeader = await post(`/sessions/${SESSION_ID}/messages`, {
      client_message_id: "msg-00000001",
      text: "hi",
      visitor_token: TOKEN,
    });
    assert.equal(noHeader.status, 404);
    const ok = await post(
      `/sessions/${SESSION_ID}/messages`,
      { client_message_id: "msg-00000001", text: "hi" },
      { authorization: `Bearer ${TOKEN}` },
    );
    assert.equal(ok.status, 200);
    const read = await fetch(url(`/sessions/${SESSION_ID}/messages?after=0`), {
      headers: { origin: ALLOWED, authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(read.status, 200);
    assert.equal(read.headers.get("access-control-allow-origin"), ALLOWED);
  });

  it("36. body over 8kb → 413 neutral, service never called", async () => {
    const before = calls.length;
    const res = await post(
      `/sessions/${SESSION_ID}/messages`,
      { client_message_id: "msg-00000001", text: "x".repeat(9000) },
      { authorization: `Bearer ${TOKEN}` },
    );
    assert.equal(res.status, 413);
    assert.deepEqual(await res.json(), { error: "payload_too_large", message: "The request is too large." });
    assert.equal(calls.length, before);
  });

  it("malformed JSON is rejected without parser details; non-object bodies reach the service as {}", async () => {
    const res = await post(`/sessions/${SESSION_ID}/messages`, "{bad json", { authorization: `Bearer ${TOKEN}` });
    assert.equal(res.status, 400);
    const text = await res.text();
    assert.doesNotMatch(text, /Unexpected|SyntaxError|at /);
    const before = calls.length;
    await post(`/sessions/${SESSION_ID}/messages`, "[1,2]", { authorization: `Bearer ${TOKEN}` });
    assert.deepEqual(calls.at(-1)?.input.body, {});
    assert.equal(calls.length, before + 1);
  });

  it("38. unexpected errors → 503 neutral body, no SQL / stack", async () => {
    const res = await post(
      `/sessions/${SESSION_ID}/messages`,
      { client_message_id: "msg-00000001", text: "boom" },
      { authorization: `Bearer ${TOKEN}` },
    );
    assert.equal(res.status, 503);
    const text = await res.text();
    assert.doesNotMatch(text, /relation|conversations|pg|stack/i);
  });

  it("unknown public paths and methods → neutral 404", async () => {
    for (const path of ["/", "/admin", `/sessions/${SESSION_ID}`, `/${KEY}/sessions/extra`]) {
      const res = await fetch(url(path), { headers: { origin: ALLOWED } });
      assert.equal(res.status, 404, path);
      assert.equal(((await res.json()) as { error: string }).error, "web_chat_unavailable");
    }
    const del = await fetch(url(`/sessions/${SESSION_ID}/messages`), { method: "DELETE" });
    assert.equal(del.status, 404);
  });

  it("kill switch disables every route including preflight", async () => {
    apiEnabled = false;
    try {
      const before = calls.length;
      const res = await post(`/${KEY}/sessions`, {});
      assert.equal(res.status, 404);
      const body = (await res.json()) as { error: string; message: string };
      assert.equal(body.error, "web_chat_unavailable");
      assert.equal(body.message, "Chat is unavailable right now.");
      const ar = await fetch(url(`/${KEY}/sessions`), {
        method: "POST",
        headers: { "content-type": "application/json", origin: ALLOWED, "accept-language": "ar" },
        body: "{}",
      });
      assert.equal(ar.status, 404);
      assert.equal(((await ar.json()) as { message: string }).message, "الدردشة غير متاحة حالياً.");
      const preflight = await fetch(url(`/${KEY}/sessions`), { method: "OPTIONS", headers: { origin: ALLOWED } });
      assert.equal(preflight.status, 404);
      assert.equal(preflight.headers.get("access-control-allow-origin"), null);
      assert.equal(calls.length, before);
    } finally {
      apiEnabled = true;
    }
  });
});
