/**
 * Web Presence Phase 2.1 — public Web Chat in the Omnichannel inbox + staff reply: live LOCAL E2E.
 *
 * Visitor side: real Phase 2 service → Supabase RPCs → Channel Platform inbound pipeline.
 * Staff side: disposable users signed in through local Supabase Auth; every inbox read and reply goes
 * through PostgREST under their JWT (RLS), using the same login-app modules as the Omnichannel console.
 * Service role is used only to provision fixtures and to run the public visitor backend (as in production).
 *
 * LOCAL ONLY: loads `.env.localstack` exclusively and refuses any non-local Supabase URL. No LLM calls
 * (the widget has no AI Employee). Commits disposable fixtures and deletes them afterwards.
 * Run (from artifacts/login-app): npx tsx --test scripts/public-web-chat-inbox-live-e2e.test.mts
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createConversationServices, type ServiceContext } from "@workspace/ai-conversation";
import pg from "../../../lib/db/node_modules/pg/lib/index.js";
import { conversationAggregator } from "../src/lib/omnichannel/aggregators/conversation-aggregator";
import {
  canViewAllOmnichannelConversations,
  canViewPublicWebChatInbox,
  filterConversationsByChannelPermission,
  resolveOmnichannelInboxChannels,
  type OmnichannelAccess,
} from "../src/lib/omnichannel/permissions";
import { mapListFilters } from "../src/lib/omnichannel/services/omnichannel-list-filters";
import {
  confirmPublicWebChatVisitorPollingReply,
  PUBLIC_WEB_CHAT_DELIVERY_MODE,
  resolvePublicWebChatReplyPlan,
  type PublicWebChatReplyClient,
} from "../src/lib/omnichannel/services/public-web-chat-reply";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const LOCAL_URL = /^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/;
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function loadLocalstackEnv(): Record<string, string> {
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
  return env;
}

const env = loadLocalstackEnv();
const SUPABASE_URL = env.SUPABASE_URL!;
const ANON_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const CO_A = "d4fdae9a-bb72-4bae-903c-cb4b971d18a8";
const CO_B = "d0000010-0001-4001-8001-000000000002";
const CO_B_ASSISTANT = "d0000100-0001-4001-8001-000000000002";
const ORIGIN = "https://shop.example.com";
const PASSWORD = `Wc21-${randomBytes(9).toString("base64url")}`;
const TAG = `wc21-e2e-${Date.now()}`;

const db = new pg.Client({ connectionString: LOCAL_DB_URL });
const admin = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Staff = {
  id: string;
  label: string;
  companyId: string;
  client: SupabaseClient;
  ctx: ServiceContext;
  access: OmnichannelAccess;
};

type Widget = { overrideId: string; channelId: string; widgetId: string; publicKey: string };

const created = {
  users: [] as string[],
  widgets: [] as Widget[],
  assistantA: null as string | null,
};

async function createWidget(companyId: string): Promise<Widget> {
  const override = await db.query(
    `insert into public.company_feature_overrides (company_id, feature_code, override_state, source, is_active, reason)
     values ($1, 'web_chat_widget', 'enabled', 'manual', true, $2) returning id`,
    [companyId, TAG],
  );
  const channel = await db.query(
    `insert into public.company_channels (company_id, channel_id, display_name, provider)
     select $1, id, 'Website chat (2.1 e2e)', 'valueor.web_widget' from public.communication_channels where key = 'web_chat'
     returning id`,
    [companyId],
  );
  const widget = await db.query(
    `insert into public.web_chat_widgets (company_id, company_channel_id, name, enabled, allowed_origins, greeting)
     values ($1, $2, '2.1 E2E site', true, $3, 'Welcome!') returning id, public_key`,
    [companyId, channel.rows[0].id, [ORIGIN]],
  );
  const result = {
    overrideId: override.rows[0].id,
    channelId: channel.rows[0].id,
    widgetId: widget.rows[0].id,
    publicKey: widget.rows[0].public_key,
  };
  created.widgets.push(result);
  return result;
}

async function createStaff(label: string, companyId: string, codes: string[]): Promise<Staff> {
  const email = `${TAG}.${label}@valueor-test.local`;
  const user = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (user.error || !user.data.user) throw new Error(`createUser ${label}: ${user.error?.message}`);
  const id = user.data.user.id;
  created.users.push(id);
  await db.query(
    `insert into public.profiles (id, user_id, company_id, full_name, email, is_active)
     values ($1, $1, $2, $3, $4, true)
     on conflict (id) do update set company_id = excluded.company_id, full_name = excluded.full_name, is_active = true`,
    [id, companyId, `2.1 ${label}`, email],
  );
  await db.query(
    `insert into public.user_permissions (user_id, permission_id)
     select $1, id from public.permissions where code = any($2::text[]) on conflict do nothing`,
    [id, codes],
  );
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signed.error) throw new Error(`signIn ${label}: ${signed.error.message}`);
  const hasPermission = (code: string) => codes.includes(code);
  return {
    id,
    label,
    companyId,
    client,
    ctx: { userId: id, companyId, isSuperAdmin: false, hasPermission },
    access: { userId: id, companyId, isSuperAdmin: false, hasPermission },
  };
}

function servicesFor(staff: Staff) {
  return createConversationServices(staff.client, {
    assignmentGovernance: false,
    assignmentAudit: null,
    linkedTicketAssignmentSync: null,
    assignmentTargetVisibility: null,
  });
}

/** Same pipeline as useOmnichannelConsole: query filters → aggregate → supported channels → channel permission. */
async function inboxFor(staff: Staff, companyId = staff.companyId) {
  const canViewAll = canViewAllOmnichannelConversations(staff.access);
  const includePublicWebChat = canViewPublicWebChatInbox(staff.access);
  const rows = await servicesFor(staff).conversations.listConversations(staff.ctx, {
    companyId,
    limit: 500,
    offset: 0,
    ...mapListFilters({}, {
      forceAssignedUserId: !canViewAll ? staff.id : undefined,
      includePublicWebChat,
    }),
  });
  const unified = conversationAggregator.aggregateList({
    conversations: rows,
    customersById: new Map(),
    agentsById: new Map(),
  });
  const supported = conversationAggregator.filterBySupportedChannels(unified, { includePublicWebChat });
  return {
    rowIds: rows.map((row) => row.id),
    visible: filterConversationsByChannelPermission(supported, resolveOmnichannelInboxChannels(staff.access)),
  };
}

/** Same sequence as useTeamInboxReply for a public Web Chat conversation. */
async function staffReply(staff: Staff, conversationId: string, text: string) {
  const replyClient = staff.client as unknown as PublicWebChatReplyClient;
  const plan = await resolvePublicWebChatReplyPlan(replyClient, {
    conversationId,
    companyId: staff.companyId,
    hasAttachments: false,
    canViewPublicWebChat: canViewPublicWebChatInbox(staff.access),
  });
  if (plan.kind !== "public_web_chat") return { plan, message: null, result: null };
  const message = await servicesFor(staff).messages.addMessage(staff.ctx, {
    conversationId,
    messageType: "outgoing",
    contentType: "text",
    content: text,
    status: "pending",
    metadata: {
      source: "team_inbox",
      agentUserId: staff.id,
      mentions: [],
      attachments: [],
      intelligenceEvents: [],
      outboundPhase: "preparing",
      deliveryMode: PUBLIC_WEB_CHAT_DELIVERY_MODE,
    },
  });
  const result = await confirmPublicWebChatVisitorPollingReply(replyClient, message.id);
  return { plan, message, result };
}

async function deleteDependents(parentTable: string, where: string, params: unknown[]) {
  const dependents = await db.query<{ tbl: string; col: string }>(
    `select c.conrelid::regclass::text as tbl, a.attname as col
     from pg_constraint c
     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = $1::regclass`,
    [parentTable],
  );
  for (const { tbl, col } of dependents.rows) {
    if (tbl === parentTable) continue;
    await db.query(`delete from ${tbl} where "${col}" in (select id from ${parentTable} where ${where})`, params);
  }
}

async function cleanup() {
  await db.query("begin");
  await db.query("set local session_replication_role = replica");
  const conversationScope = `company_channel_id = any($1::uuid[]) or metadata->>'e2eTag' = $2`;
  const channelIds = created.widgets.map((w) => w.channelId);
  // Replica role disables FK cascades: submissions must go before their sessions.
  for (const widget of created.widgets) {
    await db.query(
      `delete from public.web_chat_message_submissions where session_id in (select id from public.web_chat_visitor_sessions where widget_id = $1)`,
      [widget.widgetId],
    );
    await db.query(`delete from public.web_chat_visitor_sessions where widget_id = $1`, [widget.widgetId]);
  }
  await deleteDependents("public.conversations", conversationScope, [channelIds, TAG]);
  for (const widget of created.widgets) {
    await deleteDependents("public.company_channels", "id = $1", [widget.channelId]);
  }
  await db.query(`delete from public.conversations where ${conversationScope}`, [channelIds, TAG]);
  for (const widget of created.widgets) {
    await db.query(`delete from public.web_chat_widgets where id = $1`, [widget.widgetId]);
    await db.query(`delete from public.company_channels where id = $1`, [widget.channelId]);
    await db.query(`delete from public.company_feature_overrides where id = $1`, [widget.overrideId]);
  }
  if (created.assistantA) {
    await deleteDependents("public.ai_assistant_settings", "id = $1", [created.assistantA]);
    await db.query(`delete from public.ai_assistant_settings where id = $1`, [created.assistantA]);
  }
  if (created.users.length > 0) {
    await deleteDependents("public.profiles", "id = any($1::uuid[])", [created.users]);
    await db.query(`delete from public.user_permissions where user_id = any($1::uuid[])`, [created.users]);
    await db.query(`delete from public.profiles where id = any($1::uuid[])`, [created.users]);
  }
  await db.query("commit");
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
}

describe("Phase 2.1 — public Web Chat inbox + staff reply (live local)", () => {
  let harness: ChildProcess | null = null;
  let harnessBase = "";
  let baseUrl = "";
  let handoff: (conversationId: string) => Promise<void>;
  let widgetB: Widget;
  let convA = "";
  let convB = "";
  let internalChatB = "";
  let whatsappB = "";
  let sessionB = { id: "", token: "" };
  let staffMessageId = "";
  const staff = {} as Record<"bWeb" | "bNoWeb" | "bAgentWeb" | "bViewer" | "aWeb", Staff>;

  const headers = (token?: string) => ({
    "content-type": "application/json",
    origin: ORIGIN,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });
  const visitorSend = (clientMessageId: string, text: string) =>
    fetch(`${baseUrl}/sessions/${sessionB.id}/messages`, {
      method: "POST",
      headers: headers(sessionB.token),
      body: JSON.stringify({ client_message_id: clientMessageId, text }),
    });
  const visitorPoll = async () => {
    const response = await fetch(`${baseUrl}/sessions/${sessionB.id}/messages?after=0`, { headers: headers(sessionB.token) });
    assert.equal(response.status, 200);
    return ((await response.json()) as { messages: Array<{ sender: string; text: string }> }).messages;
  };

  before(async () => {
    await db.connect();

    widgetB = await createWidget(CO_B);
    const widgetA = await createWidget(CO_A);

    const existingAssistantA = await db.query(
      `select id from public.ai_assistant_settings where company_id = $1 and deleted_at is null limit 1`,
      [CO_A],
    );
    if (existingAssistantA.rowCount === 0) {
      const inserted = await db.query(
        `insert into public.ai_assistant_settings (company_id, assistant_name, language, is_enabled)
         values ($1, '2.1 e2e', 'en', false) returning id`,
        [CO_A],
      );
      created.assistantA = inserted.rows[0].id;
    }

    const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
    const sessionA = await db.query(
      `select public.web_chat_public_create_session($1, $2, $3, $4, $5, 86400, 5) as id`,
      [widgetA.widgetId, sha(`wct_${randomBytes(32).toString("base64url")}`), `wv_${randomBytes(16).toString("hex")}`, sha("ip-a"), sha("ua")],
    );
    const ensuredA = await db.query(`select * from public.web_chat_public_ensure_conversation($1)`, [sessionA.rows[0].id]);
    convA = ensuredA.rows[0].conversation_id;
    await db.query(
      `insert into public.conversation_messages (conversation_id, message_type, content_type, content, status, metadata)
       values ($1, 'incoming', 'text', 'Company A visitor', 'sent', '{"publicWebChat":true}')`,
      [convA],
    );

    internalChatB = (
      await db.query(
        `insert into public.conversations (company_id, ai_assistant_id, channel_type, metadata, state)
         values ($1, $2, 'web_chat', $3::jsonb, 'waiting_user') returning id`,
        [CO_B, CO_B_ASSISTANT, JSON.stringify({ channelProvider: "generic.web_chat", e2eTag: TAG })],
      )
    ).rows[0].id;
    whatsappB = (
      await db.query(
        `insert into public.conversations (company_id, ai_assistant_id, channel_type, metadata, state, last_message_at)
         values ($1, $2, 'whatsapp', $3::jsonb, 'waiting_user', now()) returning id`,
        [CO_B, CO_B_ASSISTANT, JSON.stringify({ e2eTag: TAG })],
      )
    ).rows[0].id;

    staff.bWeb = await createStaff("b-web", CO_B, [
      "ai.conversations.view",
      "ai.conversations.reply",
      "handoff.manage",
      "web_presence.view",
    ]);
    staff.bNoWeb = await createStaff("b-noweb", CO_B, [
      "ai.conversations.view",
      "ai.conversations.reply",
      "handoff.manage",
      "whatsapp.view",
      "sms.view",
      "instagram.view",
      "messenger.view",
    ]);
    // Desk agent profile: no handoff.manage / users.view, so the console scopes to assigned conversations.
    staff.bAgentWeb = await createStaff("b-agent", CO_B, [
      "ai.conversations.view",
      "ai.conversations.reply",
      "web_presence.view",
    ]);
    staff.bViewer = await createStaff("b-viewer", CO_B, ["ai.conversations.view", "handoff.manage", "web_presence.view"]);
    staff.aWeb = await createStaff("a-web", CO_A, [
      "ai.conversations.view",
      "ai.conversations.reply",
      "handoff.manage",
      "web_presence.view",
    ]);

    harness = spawn(process.execPath, ["--import", "tsx/esm", "scripts/public-web-chat-local-harness.ts"], {
      cwd: resolve(projectRoot, "artifacts/api-server"),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const port = await new Promise<number>((resolvePort, reject) => {
      let stderr = "";
      const timer = setTimeout(() => reject(new Error(`harness did not start: ${stderr.slice(-2000)}`)), 120_000);
      harness!.stderr!.on("data", (chunk) => (stderr += String(chunk)));
      harness!.stdout!.on("data", (chunk) => {
        const match = /WEB_CHAT_HARNESS_READY (\d+)/.exec(String(chunk));
        if (match) {
          clearTimeout(timer);
          resolvePort(Number(match[1]));
        }
      });
      harness!.once("exit", (code) => reject(new Error(`harness exited ${code}: ${stderr.slice(-2000)}`)));
    });
    harnessBase = `http://127.0.0.1:${port}`;
    baseUrl = `${harnessBase}/api/public/web-chat`;
    handoff = async (conversationId) => {
      const response = await fetch(`${harnessBase}/__harness/handoff/${CO_B}/${conversationId}`, { method: "POST" });
      assert.equal(response.status, 204, await response.text());
    };
  });

  after(async () => {
    harness?.kill();
    await cleanup();
    await db.end();
  });

  it("visitor starts a chat through the real public backend", async () => {
    const createdSession = await fetch(`${baseUrl}/${widgetB.publicKey}/sessions`, { method: "POST", headers: headers(), body: "{}" });
    assert.equal(createdSession.status, 201);
    const body = (await createdSession.json()) as { session: { id: string }; visitorToken: string };
    sessionB = { id: body.session.id, token: body.visitorToken };

    const first = await visitorSend("wc21-msg-0001", "Hello from the website");
    assert.equal(((await first.json()) as { status: string }).status, "accepted");
    const rows = (await db.query(`select id, metadata from public.conversations where company_channel_id = $1`, [widgetB.channelId])).rows;
    assert.equal(rows.length, 1);
    convB = rows[0].id;
    assert.equal(rows[0].metadata.publicWebChat, true);
  });

  it("1/2/7/8. Web Chat user sees the widget conversation with unread + latest message; internal AI chat excluded at query level", async () => {
    const { rowIds, visible } = await inboxFor(staff.bWeb);
    assert.ok(rowIds.includes(convB));
    assert.equal(rowIds.includes(internalChatB), false, "internal AI chat never fetched");
    assert.equal(rowIds.filter((id) => id === convB).length, 1, "no duplicates");
    const item = visible.find((c) => c.id === convB);
    assert.ok(item);
    assert.equal(item.channel, "web_chat");
    assert.equal(item.companyId, CO_B);
    assert.equal(item.companyChannelId, widgetB.channelId);
    assert.equal(item.lastMessage, "Hello from the website");
    assert.ok(item.unreadCount >= 1, `unread ${item.unreadCount}`);
    assert.ok(item.lastActivityAt);
    assert.equal(visible.some((c) => c.id === internalChatB), false);
    assert.equal(visible.some((c) => c.id === convA), false, "other tenant hidden");
    assert.ok(visible.some((c) => c.id === whatsappB), "WhatsApp still listed");
  });

  it("3/18. user with every other channel but no Web Chat grant does not get Web Chat; WhatsApp unchanged", async () => {
    const { rowIds, visible } = await inboxFor(staff.bNoWeb);
    assert.equal(rowIds.includes(convB), false, "not fetched");
    assert.equal(visible.some((c) => c.id === convB), false);
    assert.ok(visible.some((c) => c.id === whatsappB));
    const attempt = await staffReply(staff.bNoWeb, convB, "should not send");
    assert.equal(attempt.plan.kind, "rejected");
    const raw = await staff.bNoWeb.client
      .from("conversation_messages")
      .insert({ conversation_id: convB, message_type: "outgoing", content_type: "text", content: "raw bypass", status: "sent" });
    assert.ok(raw.error, "DB guard (401) blocks raw PostgREST insert");
    assert.match(raw.error.message, /Web Chat access is required/);
  });

  it("5/6. assignment-scoped agent sees the Web Chat only once assigned to them", async () => {
    assert.equal((await inboxFor(staff.bAgentWeb)).visible.some((c) => c.id === convB), false);
    await db.query(`update public.conversations set assigned_user_id = $2 where id = $1`, [convB, staff.bAgentWeb.id]);
    assert.ok((await inboxFor(staff.bAgentWeb)).visible.some((c) => c.id === convB));
    await db.query(`update public.conversations set assigned_user_id = null where id = $1`, [convB]);
    assert.equal((await inboxFor(staff.bAgentWeb)).visible.some((c) => c.id === convB), false);
  });

  it("14/15. handoff shows in the inbox and the AI stays stopped for later visitor messages", async () => {
    await handoff(convB);
    const automatedBefore = (
      await db.query(
        `select count(*)::int as n from public.conversation_messages where conversation_id = $1 and message_type = 'outgoing' and created_by is null and coalesce(metadata->>'webChatFallback','') <> 'true'`,
        [convB],
      )
    ).rows[0].n;
    const response = await visitorSend("wc21-msg-0002", "I need a human please");
    assert.equal(((await response.json()) as { status: string }).status, "handoff");
    const automatedAfter = (
      await db.query(
        `select count(*)::int as n from public.conversation_messages where conversation_id = $1 and message_type = 'outgoing' and created_by is null and coalesce(metadata->>'webChatFallback','') <> 'true'`,
        [convB],
      )
    ).rows[0].n;
    assert.equal(automatedAfter, automatedBefore, "no AI reply after handoff");
    const item = (await inboxFor(staff.bWeb)).visible.find((c) => c.id === convB);
    assert.ok(item);
    assert.equal(item.lastMessage, "I need a human please");
    const handoffRows = (
      await db.query(
        `select (select count(*) from public.handoff_requests where conversation_id = $1)
              + (select count(*) from public.handoff_conversation_ownership where conversation_id = $1)
              + (select count(*) from public.handoff_ownership_history where conversation_id = $1)
              + (select count(*) from public.handoff_context_snapshots where conversation_id = $1) as n`,
        [convB],
      )
    ).rows[0].n;
    assert.ok(Number(handoffRows) >= 1, "existing handoff records written");
  });

  it("10/11/13. staff reply persists under staff RLS, is confirmed 'sent' (not delivered), and reaches the visitor poll", async () => {
    const { plan, message, result } = await staffReply(staff.bWeb, convB, "Hi, this is Sam from the team.");
    assert.equal(plan.kind, "public_web_chat");
    assert.ok(message && result);
    staffMessageId = message.id;
    assert.equal(result.deliveryStatus, "sent");
    assert.equal(result.deliveryMode, "visitor_polling");

    const persisted = (await db.query(`select * from public.conversation_messages where id = $1`, [message.id])).rows[0];
    assert.equal(persisted.created_by, staff.bWeb.id);
    assert.equal(persisted.status, "sent");
    assert.notEqual(persisted.status, "delivered");
    assert.equal(persisted.external_message_id, null);
    assert.equal(persisted.metadata.deliveryMode, "visitor_polling");
    assert.equal(persisted.metadata.outboundPhase, "sent");
    const deliveries = (
      await db.query(`select count(*)::int as n from public.channel_delivery_events where outbound_message_id = $1`, [message.id])
    ).rows[0].n;
    assert.equal(deliveries, 0, "no provider delivery was faked");
    const afterReply = (await inboxFor(staff.bWeb)).visible.find((c) => c.id === convB);
    assert.equal(afterReply?.lastMessage, "Hi, this is Sam from the team.");

    await servicesFor(staff.bWeb).messages.addMessage(staff.bWeb.ctx, {
      conversationId: convB,
      messageType: "internal_note",
      contentType: "text",
      content: "internal: VIP visitor",
      metadata: { source: "omnichannel_internal_note", agentUserId: staff.bWeb.id },
    });

    const poll = await visitorPoll();
    assert.deepEqual(
      poll.map((m) => [m.sender, m.text]),
      [
        ["visitor", "Hello from the website"],
        ["visitor", "I need a human please"],
        ["agent", "Hi, this is Sam from the team."],
      ],
    );
  });

  it("assignment: view-all staff may reply unassigned; desk agents need assignment; visitor token never authorizes staff APIs", async () => {
    await db.query(`update public.conversations set assigned_user_id = null where id = $1`, [convB]);
    const unassignedDeskInbox = await inboxFor(staff.bAgentWeb);
    assert.equal(unassignedDeskInbox.visible.some((c) => c.id === convB), false);

    const unassignedDeskReply = await staffReply(staff.bAgentWeb, convB, "desk unassigned should not send");
    assert.equal(unassignedDeskReply.plan.kind, "public_web_chat");
    assert.ok(unassignedDeskReply.message, "ai.conversations.view still allows addMessage when the row is RLS-visible");

    await db.query(`update public.conversations set assigned_user_id = $2 where id = $1`, [convB, staff.bAgentWeb.id]);
    const assigned = await staffReply(staff.bAgentWeb, convB, "Assigned desk agent on Live Chat.");
    assert.equal(assigned.plan.kind, "public_web_chat");
    assert.ok(assigned.message && assigned.result);
    assert.equal(assigned.result.deliveryStatus, "sent");
    const pendingThenSent = (await db.query(`select status, metadata from public.conversation_messages where id = $1`, [
      assigned.message.id,
    ])).rows[0];
    assert.equal(pendingThenSent.status, "sent");
    assert.equal(pendingThenSent.metadata.outboundPhase, "sent");

    const viewAllUnassigned = await staffReply(staff.bWeb, convB, "View-all staff reply on unassigned thread.");
    assert.equal(viewAllUnassigned.plan.kind, "public_web_chat");
    assert.ok(viewAllUnassigned.message);

    const visitorClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const visitorPlan = await resolvePublicWebChatReplyPlan(visitorClient as unknown as PublicWebChatReplyClient, {
      conversationId: convB,
      companyId: CO_B,
      hasAttachments: false,
      canViewPublicWebChat: true,
    });
    assert.equal(visitorPlan.kind, "rejected");
    const visitorInsert = await visitorClient
      .from("conversation_messages")
      .insert({ conversation_id: convB, message_type: "outgoing", content_type: "text", content: "visitor spoof", status: "sent" });
    assert.ok(visitorInsert.error);
    const visitorConfirm = await visitorClient.rpc("confirm_conversation_message_outbound", {
      p_message_id: assigned.message.id,
      p_status: "sent",
      p_external_message_id: null,
    });
    assert.ok(visitorConfirm.error);
    await db.query(`update public.conversations set assigned_user_id = null where id = $1`, [convB]);
  });

  it("12. inbox rows and messages carry no token, hash, IP or user-agent data", async () => {
    const conversation = (await db.query(`select metadata from public.conversations where id = $1`, [convB])).rows[0];
    const messages = (await db.query(`select metadata from public.conversation_messages where conversation_id = $1`, [convB])).rows;
    const blob = JSON.stringify({ conversation, messages });
    assert.doesNotMatch(blob, /token|hash|user_?agent|"ip/i);
    assert.doesNotMatch(blob, new RegExp(sessionB.token));
  });

  it("4/16. tenant isolation: Company A cannot list, read, reply to or confirm Company B's Web Chat (forged ids)", async () => {
    const own = await inboxFor(staff.aWeb);
    assert.ok(own.visible.some((c) => c.id === convA));
    assert.equal(own.visible.some((c) => c.id === convB), false);

    let forgedRows: string[] = [];
    try {
      forgedRows = (await inboxFor(staff.aWeb, CO_B)).rowIds;
    } catch {
      forgedRows = [];
    }
    assert.equal(forgedRows.includes(convB), false, "forged company_id lists nothing from B");

    const plan = await resolvePublicWebChatReplyPlan(staff.aWeb.client as unknown as PublicWebChatReplyClient, {
      conversationId: convB,
      companyId: CO_A,
      hasAttachments: false,
      canViewPublicWebChat: true,
    });
    assert.equal(plan.kind, "rejected");
    await assert.rejects(() =>
      servicesFor(staff.aWeb).messages.addMessage(staff.aWeb.ctx, {
        conversationId: convB,
        messageType: "outgoing",
        contentType: "text",
        content: "cross-tenant",
      }),
    );
    const raw = await staff.aWeb.client
      .from("conversation_messages")
      .insert({ conversation_id: convB, message_type: "outgoing", content_type: "text", content: "cross-tenant raw", status: "sent" });
    assert.ok(raw.error, "RLS blocks forged conversation_id");
    const read = await staff.aWeb.client.from("conversation_messages").select("id").eq("conversation_id", convB);
    assert.deepEqual(read.data ?? [], []);
    const confirm = await staff.aWeb.client.rpc("confirm_conversation_message_outbound", {
      p_message_id: staffMessageId,
      p_status: "delivered",
      p_external_message_id: null,
    });
    assert.ok(confirm.error, "cannot confirm another tenant's message");
    const forgedChannel = await staff.aWeb.client
      .from("conversations")
      .select("id")
      .eq("company_channel_id", widgetB.channelId);
    assert.deepEqual(forgedChannel.data ?? [], [], "forged company_channel_id reveals nothing");
    const count = (await db.query(`select count(*)::int as n from public.conversation_messages where conversation_id = $1 and content like 'cross-tenant%'`, [convB])).rows[0].n;
    assert.equal(count, 0);
  });

  it("9/reply auth: viewer without reply permission cannot send", async () => {
    await assert.rejects(() => staffReply(staff.bViewer, convB, "viewer reply"));
    const raw = await staff.bViewer.client
      .from("conversation_messages")
      .insert({ conversation_id: convB, message_type: "outgoing", content_type: "text", content: "viewer raw", status: "sent" });
    assert.ok(raw.error);
  });

  it("17. internal AI chat stays out of the inbox and keeps its own reply path", async () => {
    for (const who of [staff.bWeb, staff.bNoWeb]) {
      const { rowIds, visible } = await inboxFor(who);
      assert.equal(rowIds.includes(internalChatB), false);
      assert.equal(visible.some((c) => c.id === internalChatB), false);
    }
    const plan = await resolvePublicWebChatReplyPlan(staff.bWeb.client as unknown as PublicWebChatReplyClient, {
      conversationId: internalChatB,
      companyId: CO_B,
      hasAttachments: false,
      canViewPublicWebChat: true,
    });
    assert.equal(plan.kind, "not_public_web_chat");
    const internalInsert = await staff.bNoWeb.client
      .from("conversation_messages")
      .insert({ conversation_id: internalChatB, message_type: "outgoing", content_type: "text", content: "internal chat still writable", status: "sent" })
      .select("id")
      .single();
    assert.equal(internalInsert.error, null, "401 guard does not touch internal AI chat");
  });

  it("realtime: conversations + conversation_messages stay in the realtime publication (existing inbox refresh)", async () => {
    const tables = (
      await db.query(
        `select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('conversations','conversation_messages') order by 1`,
      )
    ).rows.map((r) => r.tablename);
    assert.deepEqual(tables, ["conversation_messages", "conversations"]);
  });

  it("12(lifecycle). close uses the existing lifecycle; replies to a closed chat are refused; visitor follow-up follows existing policy", async () => {
    await servicesFor(staff.bWeb).conversations.closeConversation(staff.bWeb.ctx, { conversationId: convB });
    await assert.rejects(() => staffReply(staff.bWeb, convB, "after close"), /closed conversation/);
    const followUp = await visitorSend("wc21-msg-0003", "Are you still there?");
    const followUpBody = (await followUp.json()) as { status?: string; error?: string };
    const conversations = (
      await db.query(`select id, state from public.conversations where company_channel_id = $1 order by created_at`, [widgetB.channelId])
    ).rows;
    const landed = (
      await db.query(`select conversation_id from public.conversation_messages where content = 'Are you still there?' and conversation_id = any($1::uuid[])`, [
        conversations.map((c) => c.id),
      ])
    ).rows;
    const submission = (
      await db.query(
        `select status, outcome from public.web_chat_message_submissions where session_id = $1 and client_message_id = 'wc21-msg-0003'`,
        [sessionB.id],
      )
    ).rows[0];
    console.info("[2.1 e2e] closed-chat visitor follow-up", {
      httpStatus: followUp.status,
      body: followUpBody,
      conversations,
      landedIn: landed.map((r) => r.conversation_id),
      submission,
    });
    // Existing policy: the inbound pipeline refuses messages on a closed conversation and nothing
    // reopens it. The visitor gets the generic retryable error; no message, no new conversation.
    assert.equal(followUp.status, 503);
    assert.doesNotMatch(JSON.stringify(followUpBody), /closed|stack|conversation_id|Error:/i);
    assert.equal(landed.length, 0);
    assert.deepEqual(conversations.map((c) => c.state), ["closed"]);
  });
});
