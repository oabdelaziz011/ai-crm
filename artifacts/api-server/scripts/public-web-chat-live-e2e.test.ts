/**
 * Public Web Chat — live LOCAL end-to-end through the real Channel Platform
 * (HTTP router → service → Supabase RPCs → ChannelRouter.routeInbound → InboundMessagePipeline).
 *
 * LOCAL ONLY: loads `.env.localstack` exclusively and refuses any non-local Supabase URL.
 * Commits disposable fixtures on DEMO Beta and deletes them afterwards.
 * Run (from artifacts/api-server): node --import tsx/esm --test scripts/public-web-chat-live-e2e.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import express from "express";
import pg from "../../../lib/db/node_modules/pg/lib/index.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const LOCAL_URL = /^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/;
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function loadLocalstackEnv() {
  const raw = readFileSync(resolve(projectRoot, ".env.localstack"), "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    env[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
  }
  for (const key of ["SUPABASE_URL", "VITE_SUPABASE_URL"]) {
    if (!LOCAL_URL.test(env[key] ?? "")) throw new Error(`Refusing to run: ${key} is not local`);
  }
  if (env.DATABASE_URL && !/@(127\.0\.0\.1|localhost):54322\//.test(env.DATABASE_URL)) {
    throw new Error("Refusing to run: DATABASE_URL is not local");
  }
  Object.assign(process.env, env, { NODE_ENV: "development", PUBLIC_WEB_CHAT_API_ENABLED: "true" });
}

loadLocalstackEnv();

const CO_B = "d0000010-0001-4001-8001-000000000002";
const ORIGIN = "https://shop.example.com";
const db = new pg.Client({ connectionString: LOCAL_DB_URL });

type Fixture = { overrideId: string; channelId: string; widgetId: string; publicKey: string };

async function createFixture(): Promise<Fixture> {
  const override = await db.query(
    `insert into public.company_feature_overrides (company_id, feature_code, override_state, source, is_active, reason)
     values ($1, 'web_chat_widget', 'enabled', 'manual', true, 'public web chat live e2e') returning id`,
    [CO_B],
  );
  const channel = await db.query(
    `insert into public.company_channels (company_id, channel_id, display_name, provider)
     select $1, id, 'Website chat (e2e)', 'valueor.web_widget' from public.communication_channels where key = 'web_chat'
     returning id`,
    [CO_B],
  );
  const widget = await db.query(
    `insert into public.web_chat_widgets (company_id, company_channel_id, name, enabled, allowed_origins, greeting)
     values ($1, $2, 'E2E site', true, $3, 'Welcome!') returning id, public_key`,
    [CO_B, channel.rows[0].id, [ORIGIN]],
  );
  return {
    overrideId: override.rows[0].id,
    channelId: channel.rows[0].id,
    widgetId: widget.rows[0].id,
    publicKey: widget.rows[0].public_key,
  };
}

async function cleanupFixture(fixture: Fixture) {
  await db.query("begin");
  await db.query("set local session_replication_role = replica");
  // Replica role disables FK cascades: submissions must go before their sessions.
  await db.query(
    `delete from public.web_chat_message_submissions where session_id in (select id from public.web_chat_visitor_sessions where widget_id = $1)`,
    [fixture.widgetId],
  );
  await db.query(`delete from public.web_chat_visitor_sessions where widget_id = $1`, [fixture.widgetId]);
  const dependents = await db.query<{ tbl: string; col: string }>(
    `select c.conrelid::regclass::text as tbl, a.attname as col
     from pg_constraint c
     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.conversations'::regclass`,
  );
  for (const { tbl, col } of dependents.rows) {
    await db.query(
      `delete from ${tbl} where "${col}" in (select id from public.conversations where company_channel_id = $1)`,
      [fixture.channelId],
    );
  }
  const channelDependents = await db.query<{ tbl: string; col: string }>(
    `select c.conrelid::regclass::text as tbl, a.attname as col
     from pg_constraint c
     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.company_channels'::regclass
       and c.conrelid not in ('public.web_chat_widgets'::regclass, 'public.conversations'::regclass)`,
  );
  for (const { tbl, col } of channelDependents.rows) {
    await db.query(`delete from ${tbl} where "${col}" = $1`, [fixture.channelId]);
  }
  await db.query(
    `delete from public.web_chat_message_submissions where session_id in (select id from public.web_chat_visitor_sessions where widget_id = $1)`,
    [fixture.widgetId],
  );
  await db.query(`delete from public.web_chat_visitor_sessions where widget_id = $1`, [fixture.widgetId]);
  await db.query(`delete from public.conversations where company_channel_id = $1`, [fixture.channelId]);
  await db.query(`delete from public.web_chat_widgets where id = $1`, [fixture.widgetId]);
  await db.query(`delete from public.company_channels where id = $1`, [fixture.channelId]);
  await db.query(`delete from public.company_feature_overrides where id = $1`, [fixture.overrideId]);
  await db.query("commit");
}

describe("Public Web Chat — live local E2E (real InboundMessagePipeline)", () => {
  let fixture: Fixture;
  let server: ReturnType<express.Express["listen"]>;
  let baseUrl = "";
  let handoff: (conversationId: string) => Promise<void>;

  before(async () => {
    await db.connect();
    fixture = await createFixture();

    const { getWebhookPlatform, SYSTEM_CONTEXT } = await import("../src/platform/create-webhook-platform.js");
    const { createWebhookHandoffPlatformServices } = await import("../src/platform/create-webhook-handoff-platform.js");
    const { createPublicWebChatInboundPort } = await import("../src/services/public-web-chat/public-web-chat-inbound-port.js");
    const { createInMemoryWebChatRateLimitStore } = await import("../src/services/public-web-chat/public-web-chat-rate-limit.js");
    const { createSupabasePublicWebChatRepository } = await import("../src/services/public-web-chat/public-web-chat-repository.js");
    const { createPublicWebChatService } = await import("../src/services/public-web-chat/public-web-chat-service.js");
    const { createPublicWebChatRouter } = await import("../src/routes/public-web-chat-router.js");
    const { PUBLIC_WEB_CHAT_ROUTE_PREFIX } = await import("../src/services/public-web-chat/public-web-chat-config.js");

    const platform = getWebhookPlatform();
    const { handoffService } = createWebhookHandoffPlatformServices(platform.client);
    handoff = async (conversationId) => {
      await handoffService.requestCustomerHandoff({
        companyId: CO_B,
        conversationId,
        triggerCode: "customer_requested",
        reason: "e2e: visitor asked for a human",
      });
    };
    const service = createPublicWebChatService({
      repository: createSupabasePublicWebChatRepository(platform.client),
      inbound: createPublicWebChatInboundPort({
        router: platform.channelPlatform.router,
        systemContext: SYSTEM_CONTEXT,
        automationGate: platform.ports.inboundAutomationGate ?? null,
        handoffService,
      }),
      rateLimit: createInMemoryWebChatRateLimitStore(),
      fingerprintSecret: "e2e-secret",
      // No LLM calls in this E2E: the widget has no AI Employee, so AI never executes.
      executeAi: true,
    });

    const app = express();
    app.use(PUBLIC_WEB_CHAT_ROUTE_PREFIX, createPublicWebChatRouter({ resolveService: () => service }));
    server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", () => r()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}${PUBLIC_WEB_CHAT_ROUTE_PREFIX}`;
  });

  after(async () => {
    await new Promise<void>((r) => server?.close(() => r()) ?? r());
    if (fixture) await cleanupFixture(fixture);
    await db.end();
  });

  const headers = (token?: string) => ({
    "content-type": "application/json",
    origin: ORIGIN,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });

  it("session → message → pipeline persistence → visitor poll; duplicates ignored; no lead; handoff notice", async () => {
    const leadsBefore = (await db.query(`select count(*)::int as n from public.leads where company_id = $1`, [CO_B])).rows[0].n;

    const created = await fetch(`${baseUrl}/${fixture.publicKey}/sessions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ company_id: "d4fdae9a-bb72-4bae-903c-cb4b971d18a8" }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.headers.get("access-control-allow-origin"), ORIGIN);
    const session = (await created.json()) as { session: { id: string }; visitorToken: string; widget: { greeting: string } };
    assert.equal(session.widget.greeting, "Welcome!");
    const { id: sessionId } = session.session;
    const token = session.visitorToken;

    const send = (clientMessageId: string, text: string) =>
      fetch(`${baseUrl}/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({
          client_message_id: clientMessageId,
          text,
          conversation_id: "d0000110-0001-4001-8001-000000000002",
          company_id: "d4fdae9a-bb72-4bae-903c-cb4b971d18a8",
        }),
      });

    const [r1, r2] = await Promise.all([send("e2e-msg-0001", "Hello, is anyone there?"), send("e2e-msg-0001", "Hello, is anyone there?")]);
    const bodies = [(await r1.json()) as { status: string }, (await r2.json()) as { status: string }];
    assert.deepEqual(bodies.map((b) => b.status).sort(), ["accepted", "processing"]);

    const again = await send("e2e-msg-0001", "Hello, is anyone there?");
    assert.equal(((await again.json()) as { status: string }).status, "duplicate");

    const conversation = (
      await db.query(`select * from public.conversations where company_channel_id = $1`, [fixture.channelId])
    ).rows;
    assert.equal(conversation.length, 1);
    assert.equal(conversation[0].company_id, CO_B);
    assert.equal(conversation[0].metadata.publicWebChat, true);
    const conversationId = conversation[0].id as string;

    const incoming = await db.query(
      `select content, message_type from public.conversation_messages where conversation_id = $1 order by sequence_number`,
      [conversationId],
    );
    assert.deepEqual(incoming.rows, [{ content: "Hello, is anyone there?", message_type: "incoming" }]);
    const inbound = await db.query(
      `select count(*)::int as n from public.channel_inbound_events where company_channel_id = $1`,
      [fixture.channelId],
    );
    assert.equal(inbound.rows[0].n, 1);

    await handoff(conversationId);
    const afterHandoff = await send("e2e-msg-0002", "I need a human please");
    const handoffBody = (await afterHandoff.json()) as { status: string; notice?: string };
    assert.equal(handoffBody.status, "handoff");
    assert.equal(handoffBody.notice, "A team member will be with you shortly.");

    await db.query(
      `insert into public.conversation_messages (conversation_id, message_type, content, status, created_by)
       values ($1, 'outgoing', 'Hi, this is Sam from the team.', 'sent', 'd0000002-0001-4001-8001-000000000002'),
              ($1, 'internal_note', 'internal: VIP customer', 'sent', 'd0000002-0001-4001-8001-000000000002')`,
      [conversationId],
    );

    const poll = await fetch(`${baseUrl}/sessions/${sessionId}/messages?after=0`, { headers: headers(token) });
    assert.equal(poll.status, 200);
    const pollBody = (await poll.json()) as { messages: Array<{ sender: string; text: string }>; nextAfter: number };
    assert.deepEqual(
      pollBody.messages.map((m) => [m.sender, m.text]),
      [
        ["visitor", "Hello, is anyone there?"],
        ["visitor", "I need a human please"],
        ["agent", "Hi, this is Sam from the team."],
      ],
    );
    const incremental = await fetch(`${baseUrl}/sessions/${sessionId}/messages?after=${pollBody.nextAfter}`, {
      headers: headers(token),
    });
    assert.deepEqual(((await incremental.json()) as { messages: unknown[] }).messages, []);

    const leadsAfter = (await db.query(`select count(*)::int as n from public.leads where company_id = $1`, [CO_B])).rows[0].n;
    assert.equal(leadsAfter, leadsBefore);
    assert.equal(conversation[0].customer_id ?? null, null);

    const wrongToken = await fetch(`${baseUrl}/sessions/${sessionId}/messages`, { headers: headers(`wct_${"x".repeat(43)}`) });
    assert.equal(wrongToken.status, 404);

    await db.query(`update public.company_feature_overrides set override_state = 'disabled' where id = $1`, [fixture.overrideId]);
    const disabled = await send("e2e-msg-0003", "still there?");
    assert.equal(disabled.status, 404);
    const disabledPoll = await fetch(`${baseUrl}/sessions/${sessionId}/messages`, { headers: headers(token) });
    assert.equal(disabledPoll.status, 404);
  });
});
