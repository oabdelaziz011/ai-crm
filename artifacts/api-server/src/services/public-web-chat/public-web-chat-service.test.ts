import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { PUBLIC_WEB_CHAT_VISITOR_TEXT } from "./public-web-chat-config.js";
import { createInMemoryWebChatRateLimitStore } from "./public-web-chat-rate-limit.js";
import {
  PublicWebChatSessionLimitError,
  type PublicWebChatAuthorizedSession,
  type PublicWebChatRepository,
  type PublicWebChatVisitorMessageRow,
} from "./public-web-chat-repository.js";
import {
  createPublicWebChatService,
  normalizeVisitorText,
  toPublicVisitorPollMessage,
  type PublicWebChatInboundPort,
} from "./public-web-chat-service.js";

const ORIGIN = "https://shop.example.com";
const KEY_A = `wcw_${"a".repeat(48)}`;
const KEY_B = `wcw_${"b".repeat(48)}`;

type FakeWidget = {
  widgetId: string;
  companyId: string;
  companyChannelId: string;
  publicKey: string;
  allowedOrigins: string[];
  aiEmployeeId: string | null;
  enabled: boolean;
  entitled: boolean;
  suspended: boolean;
  config: Record<string, unknown>;
};

type FakeSession = {
  id: string;
  widgetId: string;
  tokenHash: string;
  expiresAt: number;
  blocked: boolean;
  conversationId: string | null;
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function createHarness(options: { executeAi?: boolean; apiEnabled?: boolean } = {}) {
  const widgets: FakeWidget[] = [
    {
      widgetId: randomUUID(),
      companyId: "company-a",
      companyChannelId: "channel-a",
      publicKey: KEY_A,
      allowedOrigins: [ORIGIN, "http://localhost:5173"],
      aiEmployeeId: "employee-a",
      enabled: true,
      entitled: true,
      suspended: false,
      config: {},
    },
    {
      widgetId: randomUUID(),
      companyId: "company-b",
      companyChannelId: "channel-b",
      publicKey: KEY_B,
      allowedOrigins: ["https://other.example.org"],
      aiEmployeeId: "employee-b",
      enabled: true,
      entitled: true,
      suspended: false,
      config: {},
    },
  ];
  const sessions = new Map<string, FakeSession>();
  const submissions = new Map<string, { id: string; status: "processing" | "completed" | "failed"; outcome: string | null }>();
  const conversations = new Map<string, string>();
  const persistedIncoming = new Map<string, string>();
  const messages = new Map<string, PublicWebChatVisitorMessageRow[]>();
  const fallbacks: Array<{ sessionId: string; clientMessageId: string; content: string }> = [];
  const calls = { ensure: 0, conversationsCreated: 0 };
  let now = Date.now();

  const available = (widget: FakeWidget) => widget.enabled && widget.entitled && !widget.suspended;
  const widgetById = (id: string) => widgets.find((w) => w.widgetId === id)!;

  const repository: PublicWebChatRepository = {
    async resolveWidget(publicKey) {
      const widget = widgets.find((w) => w.publicKey === publicKey);
      if (!widget || !available(widget)) return null;
      return {
        widgetId: widget.widgetId,
        companyId: widget.companyId,
        companyChannelId: widget.companyChannelId,
        allowedOrigins: widget.allowedOrigins,
        aiEmployeeId: widget.aiEmployeeId,
        greeting: "Hi",
        config: widget.config,
      };
    },
    async createSession(input) {
      const active = [...sessions.values()].filter((s) => s.widgetId === input.widgetId && s.expiresAt > now);
      if (active.length >= 50) throw new PublicWebChatSessionLimitError();
      const id = randomUUID();
      sessions.set(id, {
        id,
        widgetId: input.widgetId,
        tokenHash: input.tokenHash,
        expiresAt: now + input.ttlSeconds * 1000,
        blocked: false,
        conversationId: null,
      });
      return id;
    },
    async resumeSession(widgetId, tokenHash) {
      const session = [...sessions.values()].find((s) => s.tokenHash === tokenHash);
      if (!session || session.widgetId !== widgetId || session.blocked || session.expiresAt <= now) return null;
      if (!available(widgetById(widgetId))) return null;
      return { sessionId: session.id, expiresAt: new Date(session.expiresAt).toISOString() };
    },
    async authorizeSession(sessionId, tokenHash): Promise<PublicWebChatAuthorizedSession | null> {
      const session = sessions.get(sessionId);
      if (!session || session.tokenHash !== tokenHash || session.blocked || session.expiresAt <= now) return null;
      const widget = widgetById(session.widgetId);
      return {
        sessionId,
        companyId: widget.companyId,
        widgetId: widget.widgetId,
        companyChannelId: widget.companyChannelId,
        conversationId: session.conversationId,
        allowedOrigins: widget.allowedOrigins,
        aiEmployeeId: widget.aiEmployeeId,
        config: widget.config,
        available: available(widget),
      };
    },
    async sessionAllowedOrigins(sessionId) {
      const session = sessions.get(sessionId);
      if (!session || session.blocked || session.expiresAt <= now) return [];
      const widget = widgetById(session.widgetId);
      return available(widget) ? widget.allowedOrigins : [];
    },
    async ensureConversation(sessionId) {
      calls.ensure += 1;
      const session = sessions.get(sessionId)!;
      if (!session.conversationId) {
        session.conversationId = `conversation-${sessionId}`;
        conversations.set(sessionId, session.conversationId);
        calls.conversationsCreated += 1;
      }
      return {
        conversationId: session.conversationId,
        channelSessionId: `cs-${sessionId}`,
        externalThreadId: `webchat:${sessionId}`,
      };
    },
    async claimMessage(sessionId, clientMessageId) {
      const key = `${sessionId}:${clientMessageId}`;
      const existing = submissions.get(key);
      if (!existing) {
        const row = { id: randomUUID(), status: "processing" as const, outcome: null };
        submissions.set(key, row);
        return { submissionId: row.id, claimed: true, status: row.status, outcome: null, incomingMessageId: null };
      }
      if (existing.status === "failed") {
        existing.status = "processing";
        existing.outcome = null;
        return { submissionId: existing.id, claimed: true, status: "processing", outcome: null, incomingMessageId: null };
      }
      return {
        submissionId: existing.id,
        claimed: false,
        status: existing.status,
        outcome: existing.outcome,
        incomingMessageId: null,
      };
    },
    async completeMessage(input) {
      for (const row of submissions.values()) {
        if (row.id === input.submissionId) {
          row.status = input.status;
          row.outcome = input.outcome;
        }
      }
    },
    async findIncomingMessageId(conversationId, externalMessageId) {
      return persistedIncoming.get(`${conversationId}:${externalMessageId}`) ?? null;
    },
    async recordFallback(sessionId, clientMessageId, content) {
      if (!fallbacks.some((f) => f.sessionId === sessionId && f.clientMessageId === clientMessageId)) {
        fallbacks.push({ sessionId, clientMessageId, content });
      }
      return "fallback-id";
    },
    async listMessages(sessionId, after, limit) {
      return (messages.get(sessionId) ?? []).filter((m) => m.sequence > after).slice(0, limit);
    },
  };

  const routeCalls: Array<Parameters<PublicWebChatInboundPort["routeVisitorMessage"]>[0]> = [];
  const handoffRequests: Array<{ companyId: string; conversationId: string; reason: string }> = [];
  let routeBehavior: "reply" | "no_reply" | "throw_after_persist" | "throw_before_persist" = "reply";
  let humanOwned = false;

  const inbound: PublicWebChatInboundPort = {
    async routeVisitorMessage(input) {
      routeCalls.push(input);
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (routeBehavior === "throw_before_persist") throw new Error("Company channel must be enabled.");
      persistedIncoming.set(`${input.conversationId}:${input.externalMessageId}`, `incoming-${routeCalls.length}`);
      if (routeBehavior === "throw_after_persist") {
        throw new Error("OpenAI 401: invalid api key sk-live-SECRET at Runtime.execute (stack)");
      }
      return {
        incomingMessageId: `incoming-${routeCalls.length}`,
        responseContent: input.executeAi && routeBehavior === "reply" && !humanOwned ? "Hello from AI" : null,
        duplicate: false,
      };
    },
    async isHumanOwned() {
      return humanOwned;
    },
    async requestHandoff(input) {
      handoffRequests.push(input);
    },
  };

  const errors: Array<Record<string, unknown>> = [];
  const consumedKeys: string[] = [];
  const memoryStore = createInMemoryWebChatRateLimitStore({ now: () => now });
  const service = createPublicWebChatService({
    repository,
    inbound,
    rateLimit: {
      kind: memoryStore.kind,
      async consume(key, limit, windowMs) {
        consumedKeys.push(key);
        return memoryStore.consume(key, limit, windowMs);
      },
    },
    fingerprintSecret: "test-secret",
    executeAi: options.executeAi ?? true,
    isApiEnabled: () => options.apiEnabled ?? true,
    now: () => now,
    logger: {
      warn: (obj) => errors.push(obj),
      error: (obj) => errors.push(obj),
    },
  });

  const createSession = async (key = KEY_A, origin: string | null = ORIGIN, body: Record<string, unknown> = {}) =>
    service.createSession({ widgetKey: key, origin, body, ip: "203.0.113.7", userAgent: "UA" });

  const newSession = async (key = KEY_A, origin = ORIGIN) => {
    const result = await createSession(key, origin);
    assert.equal(result.ok, true);
    const body = (result as unknown as { body: { session: { id: string }; visitorToken: string } }).body;
    return { sessionId: body.session.id, token: body.visitorToken };
  };

  const send = (
    session: { sessionId: string; token: string },
    body: Record<string, unknown>,
    origin: string | null = ORIGIN,
  ) =>
    service.sendMessage({
      sessionId: session.sessionId,
      token: session.token,
      origin,
      body,
      ip: "203.0.113.7",
    });

  return {
    service,
    widgets,
    sessions,
    messages,
    fallbacks,
    routeCalls,
    handoffRequests,
    errors,
    consumedKeys,
    calls,
    createSession,
    newSession,
    send,
    setRouteBehavior: (value: typeof routeBehavior) => {
      routeBehavior = value;
    },
    tick: (ms: number) => {
      now += ms;
    },
    setHumanOwned: (value: boolean) => {
      humanOwned = value;
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const NEUTRAL = { ok: false, status: 404, error: "web_chat_unavailable" };

describe("Public Web Chat service — sessions", () => {
  it("1. valid session creation returns an opaque token once and stores only its SHA-256", async () => {
    const h = createHarness();
    const result = await h.createSession();
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.status, 201);
    const token = result.body.visitorToken as string;
    assert.match(token, /^wct_[A-Za-z0-9_-]{43}$/);
    const stored = [...h.sessions.values()][0]!;
    assert.equal(stored.tokenHash, sha256(token));
    assert.notEqual(stored.tokenHash, token);
    assert.deepEqual(Object.keys(result.body).sort(), ["session", "visitorToken", "widget"]);
    assert.doesNotMatch(JSON.stringify(result.body), /company|channel|conversation|employee/i);
  });

  it("2. invalid widget key (malformed or unknown) → neutral unavailable", async () => {
    const h = createHarness();
    assert.deepEqual(await h.createSession("not-a-key"), NEUTRAL);
    assert.deepEqual(await h.createSession(`wcw_${"c".repeat(48)}`), NEUTRAL);
    assert.deepEqual(await h.createSession("d4fdae9a-bb72-4bae-903c-cb4b971d18a8"), NEUTRAL);
  });

  it("3. disabled widget → neutral unavailable", async () => {
    const h = createHarness();
    h.widgets[0]!.enabled = false;
    assert.deepEqual(await h.createSession(), NEUTRAL);
  });

  it("4. disabled entitlement → neutral unavailable", async () => {
    const h = createHarness();
    h.widgets[0]!.entitled = false;
    assert.deepEqual(await h.createSession(), NEUTRAL);
  });

  it("5. suspended company → neutral unavailable", async () => {
    const h = createHarness();
    h.widgets[0]!.suspended = true;
    assert.deepEqual(await h.createSession(), NEUTRAL);
  });

  it("6. invalid origin (other host, http, wildcard, missing, path) → neutral unavailable", async () => {
    const h = createHarness();
    for (const origin of [
      "https://evil.example.com",
      "http://shop.example.com",
      "https://*.example.com",
      null,
      "null",
      "https://shop.example.com/path",
      "https://shop.example.com.evil.io",
      "https://user:pw@shop.example.com",
    ]) {
      assert.deepEqual(await h.createSession(KEY_A, origin), NEUTRAL, String(origin));
    }
  });

  it("7. valid origin: exact match, case-normalized host, default port, localhost http", async () => {
    const h = createHarness();
    for (const origin of [ORIGIN, "https://SHOP.example.com", "https://shop.example.com:443", "http://localhost:5173"]) {
      const result = await h.createSession(KEY_A, origin);
      assert.equal(result.ok, true, origin);
      h.tick(10_000);
    }
    assert.deepEqual(await h.createSession(KEY_A, "http://localhost:3000"), NEUTRAL);
  });

  it("8. token hashing: resume uses the hash, never re-issues the raw token", async () => {
    const h = createHarness();
    const first = await h.newSession();
    const resumed = await h.createSession(KEY_A, ORIGIN, { visitor_token: first.token });
    assert.equal(resumed.ok, true);
    if (!resumed.ok) return;
    assert.equal(resumed.status, 200);
    assert.equal((resumed.body.session as { id: string; resumed: boolean }).id, first.sessionId);
    assert.equal((resumed.body.session as { resumed: boolean }).resumed, true);
    assert.equal("visitorToken" in resumed.body, false);
    assert.equal(h.sessions.size, 1);
  });

  it("9 / 34. expired token cannot send or read; resume creates a new session", async () => {
    const h = createHarness();
    const session = await h.newSession();
    h.advance(25 * 60 * 60 * 1000);
    assert.deepEqual(await h.send(session, { client_message_id: "msg-00000001", text: "hi" }), NEUTRAL);
    assert.deepEqual(
      await h.service.listMessages({ ...session, origin: ORIGIN, after: undefined, limit: undefined, ip: "1.1.1.1" }),
      NEUTRAL,
    );
    const resumed = await h.createSession(KEY_A, ORIGIN, { visitor_token: session.token });
    assert.equal(resumed.ok && resumed.status, 201);
    assert.equal(h.routeCalls.length, 0);
  });

  it("10. blocked token → neutral unavailable", async () => {
    const h = createHarness();
    const session = await h.newSession();
    h.sessions.get(session.sessionId)!.blocked = true;
    assert.deepEqual(await h.send(session, { client_message_id: "msg-00000001", text: "hi" }), NEUTRAL);
    const resumed = await h.createSession(KEY_A, ORIGIN, { visitor_token: session.token });
    assert.equal(resumed.ok && (resumed.body.session as { resumed: boolean }).resumed, false);
  });

  it("11. cross-company: a widget A token never resumes or authorizes on widget B", async () => {
    const h = createHarness();
    const sessionA = await h.newSession();
    const sessionB = await h.newSession(KEY_B, "https://other.example.org");
    const resumedOnB = await h.createSession(KEY_B, "https://other.example.org", { visitor_token: sessionA.token });
    assert.equal(resumedOnB.ok && (resumedOnB.body.session as { resumed: boolean }).resumed, false);
    assert.deepEqual(
      await h.send({ sessionId: sessionB.sessionId, token: sessionA.token }, { client_message_id: "msg-00000001", text: "x" }, "https://other.example.org"),
      NEUTRAL,
    );
    assert.deepEqual(
      await h.send(sessionA, { client_message_id: "msg-00000001", text: "x" }, "https://other.example.org"),
      NEUTRAL,
    );
    assert.equal(h.routeCalls.length, 0);
  });
});

describe("Public Web Chat service — messages", () => {
  it("12–14. forged company_id / company_channel_id / conversation_id / ai_employee_id / customer_id are ignored", async () => {
    const h = createHarness();
    const session = await h.newSession();
    const result = await h.send(session, {
      client_message_id: "msg-00000001",
      text: "hello",
      company_id: "company-b",
      company_channel_id: "channel-b",
      conversation_id: "d0000110-0001-4001-8001-000000000002",
      ai_employee_id: "employee-b",
      customer_id: "customer-x",
    });
    assert.equal(result.ok, true);
    const call = h.routeCalls[0]!;
    assert.equal(call.companyId, "company-a");
    assert.equal(call.companyChannelId, "channel-a");
    assert.equal(call.conversationId, `conversation-${session.sessionId}`);
    assert.equal(call.aiEmployeeId, "employee-a");
    assert.equal(call.externalThreadId, `webchat:${session.sessionId}`);
    assert.equal(call.externalMessageId, `webchat:${session.sessionId}:msg-00000001`);
  });

  it("15. message send routes once through the channel platform with trusted ids", async () => {
    const h = createHarness();
    const session = await h.newSession();
    const result = await h.send(session, { client_message_id: "msg-00000001", text: "  hello  ", locale: "en-US" });
    assert.deepEqual(result, { ok: true, status: 200, body: { status: "replied", clientMessageId: "msg-00000001" } });
    assert.equal(h.routeCalls.length, 1);
    assert.equal(h.routeCalls[0]!.text, "hello");
    assert.equal(h.routeCalls[0]!.locale, "en-US");
    assert.equal(h.routeCalls[0]!.executeAi, true);
  });

  it("16. duplicate client_message_id (double-click / retry) → no second message or AI run", async () => {
    const h = createHarness();
    const session = await h.newSession();
    await h.send(session, { client_message_id: "msg-00000001", text: "hello" });
    const retry = await h.send(session, { client_message_id: "msg-00000001", text: "hello" });
    assert.equal(retry.ok && retry.body.status, "duplicate");
    assert.equal(retry.ok && retry.body.outcome, "replied");
    assert.equal(h.routeCalls.length, 1);
  });

  it("17. two tabs, same session, same client_message_id concurrently → one route call", async () => {
    const h = createHarness();
    const session = await h.newSession();
    const results = await Promise.all([
      h.send(session, { client_message_id: "msg-00000001", text: "hello" }),
      h.send(session, { client_message_id: "msg-00000001", text: "hello" }),
      h.send(session, { client_message_id: "msg-00000001", text: "hello" }),
    ]);
    assert.equal(h.routeCalls.length, 1);
    const statuses = results.map((r) => (r.ok ? r.body.status : r.error)).sort();
    assert.deepEqual(statuses, ["processing", "processing", "replied"]);
  });

  it("18. concurrent first messages on a new session → exactly one conversation", async () => {
    const h = createHarness();
    const session = await h.newSession();
    await Promise.all([
      h.send(session, { client_message_id: "msg-00000001", text: "a" }),
      h.send(session, { client_message_id: "msg-00000002", text: "b" }),
    ]);
    assert.equal(h.calls.conversationsCreated, 1);
    assert.equal(new Set(h.routeCalls.map((c) => c.conversationId)).size, 1);
  });

  it("19. message read returns visitor-safe fields with `after` polling", async () => {
    const h = createHarness();
    const session = await h.newSession();
    await h.send(session, { client_message_id: "msg-00000001", text: "hello" });
    h.messages.set(session.sessionId, [
      { sequence: 1, sender: "visitor", content: "hello", createdAt: "2026-01-01T00:00:00Z" },
      { sequence: 2, sender: "assistant", content: "Hi!", createdAt: "2026-01-01T00:00:01Z" },
      { sequence: 3, sender: "agent", content: "Human here", createdAt: "2026-01-01T00:00:02Z" },
    ]);
    const all = await h.service.listMessages({ ...session, origin: ORIGIN, after: undefined, limit: undefined, ip: "1.1.1.1" });
    assert.equal(all.ok, true);
    if (!all.ok) return;
    assert.deepEqual(all.body.nextAfter, 3);
    assert.deepEqual(Object.keys((all.body.messages as object[])[0]!).sort(), ["createdAt", "sender", "sequence", "text"]);
    const after = await h.service.listMessages({ ...session, origin: ORIGIN, after: "2", limit: "10", ip: "1.1.1.1" });
    assert.equal(after.ok && (after.body.messages as object[]).length, 1);
    const bad = await h.service.listMessages({ ...session, origin: ORIGIN, after: "-1", limit: undefined, ip: "1.1.1.1" });
    assert.equal(bad.ok, false);
  });

  it("20. cross-conversation read blocked: another session's token or a bare session id is rejected", async () => {
    const h = createHarness();
    const a = await h.newSession();
    const b = await h.newSession();
    h.messages.set(b.sessionId, [{ sequence: 1, sender: "visitor", content: "secret", createdAt: "x" }]);
    await h.send(b, { client_message_id: "msg-00000001", text: "secret" });
    assert.deepEqual(
      await h.service.listMessages({ sessionId: b.sessionId, token: a.token, origin: ORIGIN, after: 0, limit: 10, ip: "1" }),
      NEUTRAL,
    );
    assert.deepEqual(
      await h.service.listMessages({ sessionId: b.sessionId, token: null, origin: ORIGIN, after: 0, limit: 10, ip: "1" }),
      NEUTRAL,
    );
  });

  it("26. AI Employee comes only from the widget; no widget employee → AI not executed", async () => {
    const h = createHarness();
    h.widgets[0]!.aiEmployeeId = null;
    const session = await h.newSession();
    const result = await h.send(session, { client_message_id: "msg-00000001", text: "hello", ai_employee_id: "employee-b" });
    assert.equal(h.routeCalls[0]!.executeAi, false);
    assert.equal(h.routeCalls[0]!.aiEmployeeId, null);
    assert.equal(result.ok && result.body.status, "accepted");
    assert.equal(result.ok && result.body.notice, PUBLIC_WEB_CHAT_VISITOR_TEXT.received);
  });

  it("30. AI failure → safe fallback + optional handoff; no provider error, key, or stack exposed", async () => {
    const h = createHarness();
    const session = await h.newSession();
    h.setRouteBehavior("throw_after_persist");
    const result = await h.send(session, { client_message_id: "msg-00000001", text: "hello" });
    assert.deepEqual(result, {
      ok: true,
      status: 200,
      body: { status: "fallback", clientMessageId: "msg-00000001", notice: PUBLIC_WEB_CHAT_VISITOR_TEXT.aiFallback },
    });
    assert.doesNotMatch(JSON.stringify(result), /sk-|OpenAI|stack|401/);
    assert.equal(h.fallbacks.length, 1);
    assert.equal(h.fallbacks[0]!.content, PUBLIC_WEB_CHAT_VISITOR_TEXT.aiFallback);
    assert.equal(h.handoffRequests.length, 1);
    assert.equal(h.errors.length > 0, true);
    const retry = await h.send(session, { client_message_id: "msg-00000001", text: "hello" });
    assert.equal(retry.ok && retry.body.status, "duplicate");
    assert.equal(h.routeCalls.length, 1);
  });

  it("30b. failure before the message is stored → 503 neutral, retry allowed", async () => {
    const h = createHarness();
    const session = await h.newSession();
    h.setRouteBehavior("throw_before_persist");
    const failed = await h.send(session, { client_message_id: "msg-00000001", text: "hello" });
    assert.deepEqual(failed, { ok: false, status: 503, error: "temporarily_unavailable" });
    assert.equal(h.fallbacks.length, 0);
    h.setRouteBehavior("reply");
    const retry = await h.send(session, { client_message_id: "msg-00000001", text: "hello" });
    assert.equal(retry.ok && retry.body.status, "replied");
  });

  it("30c. handoffOnAiFailure=false keeps the fallback but skips handoff", async () => {
    const h = createHarness();
    h.widgets[0]!.config = { handoffOnAiFailure: false };
    const session = await h.newSession();
    h.setRouteBehavior("throw_after_persist");
    await h.send(session, { client_message_id: "msg-00000001", text: "hello" });
    assert.equal(h.fallbacks.length, 1);
    assert.equal(h.handoffRequests.length, 0);
  });

  it("31 / 32. human handoff: no AI reply, safe visitor notice", async () => {
    const h = createHarness();
    const session = await h.newSession();
    h.setHumanOwned(true);
    const result = await h.send(session, { client_message_id: "msg-00000001", text: "hello" });
    assert.deepEqual(result, {
      ok: true,
      status: 200,
      body: { status: "handoff", clientMessageId: "msg-00000001", notice: PUBLIC_WEB_CHAT_VISITOR_TEXT.handoff },
    });
    assert.equal(h.fallbacks.length, 0);
  });

  it("33. feature disabled after the session exists → send and read rejected neutrally", async () => {
    const h = createHarness();
    const session = await h.newSession();
    h.widgets[0]!.entitled = false;
    assert.deepEqual(await h.send(session, { client_message_id: "msg-00000001", text: "hi" }), NEUTRAL);
    assert.deepEqual(
      await h.service.listMessages({ ...session, origin: ORIGIN, after: 0, limit: 10, ip: "1" }),
      NEUTRAL,
    );
    h.widgets[0]!.entitled = true;
    h.widgets[0]!.enabled = false;
    assert.deepEqual(await h.send(session, { client_message_id: "msg-00000002", text: "hi" }), NEUTRAL);
    assert.equal(h.routeCalls.length, 0);
  });

  it("35. message validation: empty, whitespace, non-string, too long, bad client id", async () => {
    const h = createHarness();
    const session = await h.newSession();
    const invalid = { ok: false, status: 400, error: "invalid_request" };
    assert.deepEqual(await h.send(session, { client_message_id: "msg-00000001", text: "" }), invalid);
    assert.deepEqual(await h.send(session, { client_message_id: "msg-00000001", text: " \n\t " }), invalid);
    assert.deepEqual(await h.send(session, { client_message_id: "msg-00000001", text: 42 }), invalid);
    assert.deepEqual(await h.send(session, { client_message_id: "msg-00000001", text: ["x"] }), invalid);
    assert.deepEqual(await h.send(session, { client_message_id: "short", text: "hi" }), invalid);
    assert.deepEqual(await h.send(session, { client_message_id: "bad id with spaces", text: "hi" }), invalid);
    assert.deepEqual(await h.send(session, { text: "hi" }), invalid);
    assert.deepEqual(await h.send(session, { client_message_id: "msg-00000001", text: "x".repeat(2001) }), {
      ok: false,
      status: 413,
      error: "message_too_long",
    });
    assert.equal(h.routeCalls.length, 0);
    const ok = await h.send(session, { client_message_id: "msg-00000001", text: "x".repeat(2000) });
    assert.equal(ok.ok, true);
  });

  it("normalizeVisitorText strips control characters and collapses blank runs", () => {
    assert.deepEqual(normalizeVisitorText("a\u0000b\u0007c\r\n\n\n\n\nd"), { ok: true, text: "abc\n\n\nd" });
    assert.deepEqual(normalizeVisitorText("\uFEFF"), { ok: false, error: "invalid_request" });
    assert.deepEqual(normalizeVisitorText("👋🏽 مرحبا"), { ok: true, text: "👋🏽 مرحبا" });
  });

  it("38. every failure is the same neutral body without ids, SQL or stack", async () => {
    const h = createHarness();
    const session = await h.newSession();
    const failures = [
      await h.createSession("bad"),
      await h.createSession(KEY_A, "https://evil.example"),
      await h.send({ sessionId: session.sessionId, token: "wct_bad" }, { client_message_id: "msg-00000001", text: "x" }),
      await h.send({ sessionId: "not-a-uuid", token: session.token }, { client_message_id: "msg-00000001", text: "x" }),
      await h.send({ sessionId: randomUUID(), token: session.token }, { client_message_id: "msg-00000001", text: "x" }),
    ];
    for (const failure of failures) assert.deepEqual(failure, NEUTRAL);
  });

  it("kill switch: API disabled → neutral unavailable for every operation", async () => {
    const h = createHarness({ apiEnabled: false });
    assert.deepEqual(await h.createSession(), NEUTRAL);
    assert.equal(await h.service.preflightOrigin({ kind: "session_create", widgetKey: KEY_A, origin: ORIGIN }), null);
  });

  it("preflight reflects only allowed origins for the widget / session", async () => {
    const h = createHarness();
    const session = await h.newSession();
    assert.equal(await h.service.preflightOrigin({ kind: "session_create", widgetKey: KEY_A, origin: ORIGIN }), ORIGIN);
    assert.equal(await h.service.preflightOrigin({ kind: "session_create", widgetKey: KEY_A, origin: "https://evil.io" }), null);
    assert.equal(await h.service.preflightOrigin({ kind: "session", sessionId: session.sessionId, origin: ORIGIN }), ORIGIN);
    assert.equal(await h.service.preflightOrigin({ kind: "session", sessionId: randomUUID(), origin: ORIGIN }), null);
  });
});

describe("Public Web Chat rate limiting (in-memory store for unit tests)", () => {
  it("in-memory store is fixed-window, per key, and labelled memory", async () => {
    let now = 0;
    const store = createInMemoryWebChatRateLimitStore({ now: () => now });
    assert.equal(store.kind, "memory");
    for (let i = 0; i < 3; i += 1) assert.equal((await store.consume("k", 3, 1000)).allowed, true);
    const blocked = await store.consume("k", 3, 1000);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 1);
    assert.equal((await store.consume("other", 3, 1000)).allowed, true);
    now = 1000;
    assert.equal((await store.consume("k", 3, 1000)).allowed, true);
  });

  it("service returns 429 when session creation burst per IP is exceeded", async () => {
    const h = createHarness();
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await h.createSession());
    assert.equal(results.filter((r) => r.ok).length, 3);
    const limited = results.at(-1)!;
    assert.equal(limited.ok, false);
    assert.equal(!limited.ok && limited.status, 429);
    assert.equal(!limited.ok && limited.error, "rate_limited");
  });

  it("service returns 429 when session creation per IP is exceeded across windows", async () => {
    const h = createHarness();
    const results = [];
    for (let i = 0; i < 12; i += 1) {
      if (i > 0 && i % 3 === 0) h.tick(10_000);
      results.push(await h.createSession());
    }
    assert.equal(results.filter((r) => r.ok).length, 10);
    const limited = results.at(-1)!;
    assert.equal(limited.ok, false);
    assert.equal(!limited.ok && limited.status, 429);
    assert.equal(!limited.ok && limited.error, "rate_limited");
  });

  it("service returns 429 when message burst per session is exceeded", async () => {
    const h = createHarness();
    const session = await h.newSession();
    let last;
    for (let i = 0; i < 13; i += 1) {
      last = await h.send(session, { client_message_id: `msg-${String(i).padStart(8, "0")}`, text: "hi" });
    }
    assert.equal(last!.ok, false);
    assert.equal(!last!.ok && last!.status, 429);
    assert.equal(h.routeCalls.length, 12);
  });

  it("service returns 429 when messages per session are exceeded", async () => {
    const h = createHarness();
    const session = await h.newSession();
    let last;
    for (let i = 0; i < 21; i += 1) {
      if (i > 0 && i % 5 === 0) h.tick(10_000);
      last = await h.send(session, { client_message_id: `msg-${String(i).padStart(8, "0")}`, text: "hi" });
    }
    assert.equal(last!.ok, false);
    assert.equal(!last!.ok && last!.status, 429);
    assert.equal(h.routeCalls.length, 20);
  });

  it("message IP windows run before token/origin auth; session buckets require a valid session", async () => {
    const h = createHarness();
    const session = await h.newSession();
    h.consumedKeys.length = 0;
    const forged = await h.send(
      { sessionId: session.sessionId, token: `wct_${"B".repeat(43)}` },
      { client_message_id: "msg-00000099", text: "x" },
    );
    assert.deepEqual(forged, NEUTRAL);
    assert.ok(h.consumedKeys.some((k) => k.startsWith("message:burst:ip:")));
    assert.ok(h.consumedKeys.some((k) => k.startsWith("message:ip:")));
    assert.equal(
      h.consumedKeys.some((k) => k.startsWith("message:burst:session:") || k.startsWith("message:session:")),
      false,
    );
    assert.equal(h.routeCalls.length, 0);

    h.consumedKeys.length = 0;
    const ok = await h.send(session, { client_message_id: "msg-00000100", text: "hello" });
    assert.equal(ok.ok, true);
    assert.ok(h.consumedKeys.some((k) => k.startsWith("message:burst:session:")));
    assert.equal(h.routeCalls.length, 1);

    const flooded = createHarness();
    const live = await flooded.newSession();
    let lastForged;
    for (let i = 0; i < 21; i += 1) {
      lastForged = await flooded.send(
        { sessionId: live.sessionId, token: `wct_${"C".repeat(43)}` },
        { client_message_id: `msg-x${String(i).padStart(7, "0")}`, text: "x" },
      );
    }
    assert.equal(lastForged!.ok, false);
    assert.equal(!lastForged!.ok && lastForged!.status, 429);
    const validAfterFlood = await flooded.send(live, { client_message_id: "msg-00000101", text: "hello" });
    assert.equal(validAfterFlood.ok, false);
    assert.equal(!validAfterFlood.ok && validAfterFlood.status, 429);
    assert.equal(flooded.routeCalls.length, 0);
  });
});

describe("Public Web Chat visitor poll redaction", () => {
  it("toPublicVisitorPollMessage only exposes sequence, sender, text, createdAt", () => {
    const publicRow = toPublicVisitorPollMessage({
      sequence: 3,
      sender: "assistant",
      content: "Hello",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    assert.deepEqual(Object.keys(publicRow).sort(), ["createdAt", "sender", "sequence", "text"]);
    assert.equal(JSON.stringify(publicRow).includes("token"), false);
  });
});
