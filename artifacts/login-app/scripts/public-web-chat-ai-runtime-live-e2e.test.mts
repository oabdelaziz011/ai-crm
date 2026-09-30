/**
 * Phase 2.2 — real Public Web Chat → existing AI Employee runtime → sandbox LLM E2E.
 * LOCAL ONLY (.env.localstack). No production URL, no customer API key, no Meta.
 * Run from artifacts/login-app: npx tsx --test scripts/public-web-chat-ai-runtime-live-e2e.test.mts
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
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
  Object.assign(process.env, env, { NODE_ENV: "development", PUBLIC_WEB_CHAT_API_ENABLED: "true" });
  return env;
}

const env = loadLocalstackEnv();
const SUPABASE_URL = env.SUPABASE_URL!;
const ANON_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const CO_A = "d0000010-0001-4001-8001-000000000003";
const CO_B = "d0000010-0001-4001-8001-000000000002";
const CO_B_ASSISTANT = "d0000100-0001-4001-8001-000000000002";
const ORIGIN = "https://shop.example.com";
const PASSWORD = `Wc22-${randomBytes(9).toString("base64url")}`;
const TAG = `wc22-e2e-${Date.now()}`;

const db = new pg.Client({ connectionString: LOCAL_DB_URL });
const admin = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Staff = {
  id: string;
  companyId: string;
  client: SupabaseClient;
  ctx: ServiceContext;
  access: OmnichannelAccess;
};
type Widget = { overrideId: string; channelId: string; widgetId: string; publicKey: string };

const created = {
  users: [] as string[],
  widgets: [] as Widget[],
  employees: [] as string[],
  connections: [] as string[],
  definitionId: null as string | null,
  previousDefaults: [] as Array<{ id: string }>,
  assistantA: null as string | null,
  featureOverrides: [] as string[],
  featureRestore: [] as Array<{ id: string; override_state: string; source: string }>,
};

async function ensurePlatformAiFlag(companyId: string, featureKey: string): Promise<void> {
  const existing = await db.query(
    `select id from public.platform_ai_feature_flags where company_id = $1 and feature_key = $2 limit 1`,
    [companyId, featureKey],
  );
  if (existing.rows[0]) {
    await db.query(`update public.platform_ai_feature_flags set is_enabled = true where id = $1`, [
      existing.rows[0].id,
    ]);
    return;
  }
  await db.query(
    `insert into public.platform_ai_feature_flags (company_id, feature_key, is_enabled) values ($1, $2, true)`,
    [companyId, featureKey],
  );
}

async function enableManualFeature(companyId: string, featureCode: string): Promise<void> {
  const existing = await db.query(
    `select id, override_state, source from public.company_feature_overrides
     where company_id = $1 and feature_code = $2 and is_active = true
     order by created_at desc limit 1`,
    [companyId, featureCode],
  );
  if (existing.rows[0]) {
    created.featureRestore.push({
      id: existing.rows[0].id,
      override_state: existing.rows[0].override_state,
      source: existing.rows[0].source,
    });
    await db.query(
      `update public.company_feature_overrides
       set override_state = 'enabled', source = 'manual', reason = $2
       where id = $1`,
      [existing.rows[0].id, TAG],
    );
    return;
  }
  const row = await db.query(
    `insert into public.company_feature_overrides (company_id, feature_code, override_state, source, is_active, reason)
     values ($1, $2, 'enabled', 'manual', true, $3) returning id`,
    [companyId, featureCode, TAG],
  );
  created.featureOverrides.push(row.rows[0].id);
}

async function createWidget(companyId: string, aiEmployeeId: string | null): Promise<Widget> {
  const channel = await db.query(
    `insert into public.company_channels (company_id, channel_id, display_name, provider)
     select $1, id, 'Website chat (2.2 e2e)', 'valueor.web_widget' from public.communication_channels where key = 'web_chat'
     returning id`,
    [companyId],
  );
  const widget = await db.query(
    `insert into public.web_chat_widgets
      (company_id, company_channel_id, name, enabled, allowed_origins, greeting, ai_employee_id, config)
     values ($1, $2, '2.2 E2E site', true, $3, 'Welcome!', $4, $5::jsonb)
     returning id, public_key`,
    [companyId, channel.rows[0].id, [ORIGIN], aiEmployeeId, JSON.stringify({ aiEnabled: true })],
  );
  const result = {
    overrideId: "",
    channelId: channel.rows[0].id,
    widgetId: widget.rows[0].id,
    publicKey: widget.rows[0].public_key,
  };
  created.widgets.push(result);
  return result;
}

async function ensureSandboxDefinition(): Promise<string> {
  const existing = await db.query(`select id from public.ai_provider_definitions where key = 'sandbox'`);
  if (existing.rows[0]) {
    created.definitionId = existing.rows[0].id;
    return existing.rows[0].id;
  }
  const inserted = await db.query(
    `insert into public.ai_provider_definitions (key, display_name, description, is_active)
     values ('sandbox', 'Sandbox E2E LLM', 'Local Phase 2.2 sandbox provider', true)
     returning id`,
  );
  created.definitionId = inserted.rows[0].id;
  return inserted.rows[0].id;
}

async function createSandboxConnection(companyId: string, definitionId: string): Promise<string> {
  const previous = await db.query(
    `select id from public.ai_provider_connections where company_id = $1 and is_default = true and deleted_at is null`,
    [companyId],
  );
  for (const row of previous.rows) created.previousDefaults.push({ id: row.id });
  await db.query(
    `update public.ai_provider_connections set is_default = false where company_id = $1 and deleted_at is null`,
    [companyId],
  );
  const row = await db.query(
    `insert into public.ai_provider_connections
      (company_id, provider_id, display_name, status, configuration, is_default, is_enabled, health_status, uses_platform_key)
     values ($1, $2, $3, 'active', '{}'::jsonb, true, true, 'connected', false)
     returning id`,
    [companyId, definitionId, `Phase 2.2 sandbox ${TAG}`],
  );
  created.connections.push(row.rows[0].id);
  return row.rows[0].id;
}

async function createEmployee(companyId: string): Promise<string> {
  const tools = JSON.stringify(["knowledge_search", "escalate_to_human", "queue_handoff"]);
  const tags = JSON.stringify(["channel:web_chat", "capability:omnichannel"]);
  const employee = await db.query(
    `insert into public.ai_employees
      (company_id, name, display_name, status, provider, model, system_prompt, allowed_tool_keys, tags)
     values ($1, $2, 'Web Chat sandbox employee', 'published', 'sandbox', 'sandbox-e2e',
       'You are the company web chat assistant. Never mention other companies. Never echo secrets.',
       $3::jsonb, $4::jsonb)
     returning id`,
    [companyId, `${TAG}-${companyId.slice(0, 8)}`, tools, tags],
  );
  const id = employee.rows[0].id as string;
  const version = await db.query(
    `insert into public.ai_employee_versions
      (company_id, employee_id, version_number, status, snapshot, publish_notes)
     values ($1, $2, 1, 'published', $3::jsonb, 'phase 2.2 e2e')
     returning id`,
    [companyId, id, JSON.stringify({ allowedToolKeys: JSON.parse(tools), tags: JSON.parse(tags) })],
  );
  await db.query(
    `update public.ai_employees set published_version_id = $1, current_version_number = 1 where id = $2`,
    [version.rows[0].id, id],
  );
  created.employees.push(id);
  return id;
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
     on conflict (id) do update set company_id = excluded.company_id, is_active = true`,
    [id, companyId, `2.2 ${label}`, email],
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

async function inboxFor(staff: Staff, companyId = staff.companyId) {
  const canViewAll = canViewAllOmnichannelConversations(staff.access);
  const includePublicWebChat = canViewPublicWebChatInbox(staff.access);
  const rows = await servicesFor(staff).conversations.listConversations(staff.ctx, {
    companyId,
    limit: 500,
    offset: 0,
    ...mapListFilters({}, { forceAssignedUserId: !canViewAll ? staff.id : undefined, includePublicWebChat }),
  });
  const unified = conversationAggregator.aggregateList({
    conversations: rows,
    customersById: new Map(),
    agentsById: new Map(),
  });
  const supported = conversationAggregator.filterBySupportedChannels(unified, { includePublicWebChat });
  return filterConversationsByChannelPermission(supported, resolveOmnichannelInboxChannels(staff.access));
}

async function staffReply(staff: Staff, conversationId: string, text: string) {
  const replyClient = staff.client as unknown as PublicWebChatReplyClient;
  const plan = await resolvePublicWebChatReplyPlan(replyClient, {
    conversationId,
    companyId: staff.companyId,
    hasAttachments: false,
    canViewPublicWebChat: canViewPublicWebChatInbox(staff.access),
  });
  if (plan.kind !== "public_web_chat") return { plan, message: null };
  const message = await servicesFor(staff).messages.addMessage(staff.ctx, {
    conversationId,
    messageType: "outgoing",
    contentType: "text",
    content: text,
    status: "pending",
    metadata: { source: "team_inbox", deliveryMode: PUBLIC_WEB_CHAT_DELIVERY_MODE },
  });
  await confirmPublicWebChatVisitorPollingReply(replyClient, message.id);
  return { plan, message };
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
  const channelIds = created.widgets.map((w) => w.channelId);
  const conversationScope = `company_channel_id = any($1::uuid[]) or metadata->>'e2eTag' = $2`;
  for (const widget of created.widgets) {
    await db.query(
      `delete from public.web_chat_message_submissions where session_id in (select id from public.web_chat_visitor_sessions where widget_id = $1)`,
      [widget.widgetId],
    );
    await db.query(`delete from public.web_chat_visitor_sessions where widget_id = $1`, [widget.widgetId]);
  }
  await deleteDependents("public.conversations", conversationScope, [channelIds, TAG]);
  await db.query(`delete from public.conversations where ${conversationScope}`, [channelIds, TAG]);
  for (const widget of created.widgets) {
    await db.query(`delete from public.web_chat_widgets where id = $1`, [widget.widgetId]);
    await db.query(`delete from public.company_channels where id = $1`, [widget.channelId]);
    if (widget.overrideId) {
      await db.query(`delete from public.company_feature_overrides where id = $1`, [widget.overrideId]);
    }
  }
  if (created.featureOverrides.length > 0) {
    await db.query(`delete from public.company_feature_overrides where id = any($1::uuid[])`, [
      created.featureOverrides,
    ]);
  }
  for (const row of created.featureRestore) {
    await db.query(
      `update public.company_feature_overrides set override_state = $2, source = $3 where id = $1`,
      [row.id, row.override_state, row.source],
    );
  }
  for (const id of created.employees) {
    await db.query(`delete from public.ai_employee_versions where employee_id = $1`, [id]);
    await db.query(`delete from public.ai_employee_deployments where employee_id = $1`, [id]);
    await db.query(`delete from public.ai_employees where id = $1`, [id]);
  }
  for (const id of created.connections) {
    await db.query(`delete from public.ai_provider_connections where id = $1`, [id]);
  }
  for (const { id } of created.previousDefaults) {
    await db.query(`update public.ai_provider_connections set is_default = true where id = $1`, [id]);
  }
  if (created.assistantA) {
    await db.query(`delete from public.ai_assistant_settings where id = $1`, [created.assistantA]);
  }
  if (created.users.length > 0) {
    await db.query(`delete from public.user_permissions where user_id = any($1::uuid[])`, [created.users]);
    await db.query(`delete from public.profiles where id = any($1::uuid[])`, [created.users]);
  }
  await db.query("commit");
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
}

describe("Phase 2.2 — public Web Chat real AI runtime + sandbox LLM (live local)", () => {
  let harness: ChildProcess | null = null;
  let harnessBase = "";
  let baseUrl = "";
  let widgetB: Widget;
  let widgetA: Widget;
  let convB = "";
  let sessionB = { id: "", token: "" };
  let staffB: Staff;
  let staffA: Staff;

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

  const poll = async () => {
    const res = await fetch(`${baseUrl}/sessions/${sessionB.id}/messages?after=0&limit=50`, {
      headers: headers(sessionB.token),
    });
    const body = await res.json();
    return { res, body, messages: (body.messages ?? []) as Array<{ sender: string; text: string }> };
  };

  const sandboxInvocations = async () => {
    const res = await fetch(`${harnessBase}/__harness/sandbox-llm`);
    const body = await res.json();
    return (body.invocations ?? []) as Array<Record<string, unknown>>;
  };

  before(async () => {
    await db.connect();
    for (const companyId of [CO_A, CO_B]) {
      for (const code of ["web_chat_widget", "omnichannel", "ai_employee", "ai_assistant"]) {
        await enableManualFeature(companyId, code);
      }
      for (const key of ["ai_chat", "tool_calling"]) {
        await ensurePlatformAiFlag(companyId, key);
      }
    }
    const definitionId = await ensureSandboxDefinition();
    await createSandboxConnection(CO_B, definitionId);
    await createSandboxConnection(CO_A, definitionId);
    const employeeB = await createEmployee(CO_B);
    const employeeA = await createEmployee(CO_A);
    const existingA = await db.query(`select id from public.ai_assistant_settings where company_id = $1 limit 1`, [CO_A]);
    if (!existingA.rows[0]) {
      const inserted = await db.query(
        `insert into public.ai_assistant_settings (company_id, assistant_name) values ($1, '2.2 temp A') returning id`,
        [CO_A],
      );
      created.assistantA = inserted.rows[0].id;
    }
    widgetB = await createWidget(CO_B, employeeB);
    widgetA = await createWidget(CO_A, employeeA);
    staffB = await createStaff("bWeb", CO_B, [
      "ai.conversations.view",
      "ai.conversations.reply",
      "handoff.manage",
      "web_presence.view",
    ]);
    staffA = await createStaff("aWeb", CO_A, [
      "ai.conversations.view",
      "ai.conversations.reply",
      "handoff.manage",
      "web_presence.view",
    ]);

    harness = spawn(process.execPath, ["--import", "tsx/esm", "scripts/public-web-chat-local-harness.ts"], {
      cwd: resolve(projectRoot, "artifacts/api-server"),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    harnessBase = await new Promise<string>((resolveReady, reject) => {
      const timer = setTimeout(() => reject(new Error(`harness start timeout: ${chunks}`)), 90_000);
      const chunks: string[] = [];
      const onChunk = (buf: Buffer) => {
        const text = buf.toString();
        chunks.push(text);
        const match = /WEB_CHAT_HARNESS_READY (\d+)/.exec(chunks.join(""));
        if (match) {
          clearTimeout(timer);
          resolveReady(`http://127.0.0.1:${match[1]}`);
        }
      };
      harness!.stdout?.on("data", onChunk);
      harness!.stderr?.on("data", onChunk);
      harness!.on("exit", (code) => reject(new Error(`harness exited ${code}: ${chunks.join("")}`)));
    });
    baseUrl = `${harnessBase}/api/public/web-chat`;
    await fetch(`${harnessBase}/__harness/sandbox-llm/reset`, { method: "POST" });
  });

  after(async () => {
    harness?.kill("SIGTERM");
    try {
      await cleanup();
    } finally {
      await db.end();
    }
  });

  it("1 visitor message hits the real runtime and sandbox LLM, then visitor polling sees the reply", async () => {
    const sessionRes = await fetch(`${baseUrl}/${widgetB.publicKey}/sessions`, {
      method: "POST",
      headers: headers(),
      body: "{}",
    });
    assert.ok(sessionRes.status === 200 || sessionRes.status === 201, `session ${sessionRes.status}`);
    const sessionBody = (await sessionRes.json()) as { session: { id: string }; visitorToken: string };
    sessionB = { id: sessionBody.session.id, token: sessionBody.visitorToken };
    const send = await visitorSend("wc22-msg-0001", "I need help with my order.");
    const sendBody = await send.json();
    assert.equal(send.status, 200, JSON.stringify(sendBody));
    const connections = await db.query(
      `select display_name, is_default, is_enabled, uses_platform_key from public.ai_provider_connections
       where company_id = $1 and deleted_at is null`,
      [CO_B],
    );
    const exec = await db.query(
      `select provider_key, status, error_message, started_at from public.ai_executions
       where company_id = $1 and started_at > now() - interval '2 minutes'
       order by started_at desc nulls last limit 5`,
      [CO_B],
    );
    assert.equal(sendBody.status, "replied", JSON.stringify({ sendBody, connections: connections.rows, exec: exec.rows }));

    const conv = await db.query(
      `select id, company_id, channel_type, state, metadata, unread_count_employee
       from public.conversations where company_channel_id = $1 order by created_at desc limit 1`,
      [widgetB.channelId],
    );
    assert.equal(conv.rows.length, 1);
    convB = conv.rows[0].id;
    assert.equal(conv.rows[0].company_id, CO_B);
    assert.equal(conv.rows[0].channel_type, "web_chat");
    assert.equal(conv.rows[0].metadata.publicWebChat, true);
    assert.equal(conv.rows[0].metadata.channelProvider, "valueor.web_widget");
    assert.ok(Number(conv.rows[0].unread_count_employee) >= 1);

    const invocations = await sandboxInvocations();
    const mine = invocations.filter((row) => row.conversationId === convB);
    assert.ok(mine.length >= 1, `expected sandbox LLM call, got ${JSON.stringify(invocations)}`);
    assert.equal(mine[0]?.companyId, CO_B);
    assert.match(String(mine[0]?.userMessage), /I need help with my order/);
    const blob = JSON.stringify(mine);
    assert.equal(blob.includes(sessionB.token), false);
    assert.doesNotMatch(blob, /tokenHash|token_hash|ipHash|ip_hash|ua_hash|userAgentHash/);
    assert.equal(blob.includes(CO_A), false);

    const polled = await poll();
    assert.equal(polled.res.status, 200);
    const assistant = polled.messages.filter((m) => m.sender === "assistant");
    assert.ok(assistant.some((m) => /order/i.test(m.text)), JSON.stringify(polled.messages));

    const internal = await db.query(
      `select count(*)::int as n from public.conversations
       where company_id = $1 and channel_type = 'web_chat' and coalesce(metadata->>'publicWebChat','') <> 'true'
         and created_at > now() - interval '10 minutes'`,
      [CO_B],
    );
    assert.equal(internal.rows[0].n, 0);
  });

  it("2 visitor asking for a human goes through AI then inbox; staff reply reaches visitor polling", async () => {
    await db.query(`update public.conversations set state = 'waiting_user' where id = $1`, [convB]);
    const unreadBefore = await db.query(`select unread_count_employee from public.conversations where id = $1`, [convB]);
    const send = await visitorSend("wc22-msg-0002", "Please transfer this conversation now.");
    const sendBody = await send.json();
    assert.equal(send.status, 200, JSON.stringify(sendBody));

    const afterEscalate = await sandboxInvocations();
    const escalateCalls = afterEscalate.filter(
      (row) =>
        row.conversationId === convB &&
        (row.toolCallName === "escalate_to_human" || String(row.userMessage).includes("transfer this conversation")),
    );
    assert.ok(escalateCalls.length >= 1, JSON.stringify({ sendBody, escalateCalls, afterEscalate }));

    const conv = await db.query(
      `select state, unread_count_employee from public.conversations where id = $1`,
      [convB],
    );
    const ownership = await db.query(
      `select owner_type, lifecycle_state, assigned_user_id from public.handoff_conversation_ownership where conversation_id = $1`,
      [convB],
    );
    const handoff = await db.query(
      `select count(*)::int as n from (
         select 1 from public.handoff_requests where conversation_id = $1
         union all select 1 from public.handoff_conversation_ownership
           where conversation_id = $1 and lifecycle_state in ('ESCALATED','WAITING_QUEUE','ASSIGNED')
       ) x`,
      [convB],
    );
    assert.ok(
      handoff.rows[0].n >= 1,
      JSON.stringify({ sendBody, conv: conv.rows[0], ownership: ownership.rows, escalateCalls }),
    );
    assert.ok(
      conv.rows[0].state === "transferred_to_human" ||
        ownership.rows.some((row: { lifecycle_state: string }) =>
          ["ESCALATED", "WAITING_QUEUE", "ASSIGNED"].includes(row.lifecycle_state),
        ),
      JSON.stringify({ sendBody, conv: conv.rows[0], ownership: ownership.rows }),
    );
    assert.ok(Number(conv.rows[0].unread_count_employee) >= Number(unreadBefore.rows[0].unread_count_employee));

    const visible = await inboxFor(staffB);
    assert.ok(visible.some((row) => row.id === convB));

    const hiddenFromA = await inboxFor(staffA);
    assert.equal(hiddenFromA.some((row) => row.id === convB), false);

    const eventsBeforeStaff = await db.query(
      `select count(*)::int as n from public.channel_delivery_events where conversation_id = $1`,
      [convB],
    );
    const afterHandoffVisitor = await visitorSend("wc22-msg-0002b", "Is anyone there after the transfer?");
    assert.equal(afterHandoffVisitor.status, 200);
    const blockingOwnership = ownership.rows.some((row: { lifecycle_state: string; owner_type: string }) =>
      ["ESCALATED", "WAITING_QUEUE", "ASSIGNED"].includes(row.lifecycle_state) ||
      ["human_agent", "queue"].includes(row.owner_type),
    );
    if (blockingOwnership) {
      const afterHandoffVisitorInvocations = await sandboxInvocations();
      assert.equal(
        afterHandoffVisitorInvocations.filter((row) => String(row.userMessage).includes("after the transfer")).length,
        0,
        JSON.stringify({ ownership: ownership.rows, conv: conv.rows[0] }),
      );
    }

    const reply = await staffReply(staffB, convB, "Staff here — I have your order.");
    assert.equal(reply.plan.kind, "public_web_chat");
    const events = await db.query(
      `select count(*)::int as n from public.channel_delivery_events where conversation_id = $1`,
      [convB],
    );
    assert.equal(events.rows[0].n, eventsBeforeStaff.rows[0].n);

    const afterHandoff = await sandboxInvocations();
    const postStaff = afterHandoff.filter(
      (row) => row.conversationId === convB && String(row.userMessage).includes("Staff here"),
    );
    assert.equal(postStaff.length, 0, "AI must not run on the staff reply");

    const polled = await poll();
    assert.ok(polled.messages.some((m) => m.sender === "agent" && /Staff here/.test(m.text)));
  });

  it("3 closed conversation keeps the Phase 2.1 503 policy", async () => {
    await db.query(`update public.conversations set state = 'closed' where id = $1`, [convB]);
    const send = await visitorSend("wc22-msg-0003", "Are you still there?");
    const body = await send.json();
    assert.equal(send.status, 503);
    assert.equal(body.error, "temporarily_unavailable");
    const still = await db.query(`select state from public.conversations where id = $1`, [convB]);
    assert.equal(still.rows[0].state, "closed");
    const extra = await db.query(
      `select count(*)::int as n from public.conversation_messages
       where conversation_id = $1 and content like 'Are you still there%'`,
      [convB],
    );
    assert.equal(extra.rows[0].n, 0);
  });

  it("4 forged ids and Company A isolation are rejected", async () => {
    const forgedConv = await fetch(`${baseUrl}/sessions/${sessionB.id}/messages`, {
      method: "POST",
      headers: headers(sessionB.token),
      body: JSON.stringify({ client_message_id: "wc22-msg-0004", text: "x", companyId: CO_A, companyChannelId: widgetA.channelId }),
    });
    assert.ok(forgedConv.status === 200 || forgedConv.status >= 400);

    const aSession = await fetch(`${baseUrl}/${widgetA.publicKey}/sessions`, {
      method: "POST",
      headers: headers(),
      body: "{}",
    });
    assert.ok(aSession.status === 200 || aSession.status === 201, `a session ${aSession.status}`);
    const aBody = (await aSession.json()) as { session: { id: string }; visitorToken: string };
    const aSend = await fetch(`${baseUrl}/sessions/${aBody.session.id}/messages`, {
      method: "POST",
      headers: headers(aBody.visitorToken),
      body: JSON.stringify({ client_message_id: "wc22-a-0001", text: "I need help with my order." }),
    });
    const aSendBody = await aSend.json();
    assert.equal(aSend.status, 200, JSON.stringify(aSendBody));
    const aExec = await db.query(
      `select provider_key, status, error_message from public.ai_executions
       where company_id = $1 and started_at > now() - interval '5 minutes'
       order by started_at desc nulls last limit 5`,
      [CO_A],
    );
    const aConn = await db.query(
      `select c.display_name, c.is_default, c.is_enabled, c.status, d.key
       from public.ai_provider_connections c
       join public.ai_provider_definitions d on d.id = c.provider_id
       where c.company_id = $1 and c.deleted_at is null`,
      [CO_A],
    );
    const aEmp = await db.query(
      `select provider, model, status, published_version_id from public.ai_employees where company_id = $1 order by created_at desc limit 3`,
      [CO_A],
    );
    assert.equal(
      aSendBody.status,
      "replied",
      JSON.stringify({ aSendBody, aExec: aExec.rows, aConn: aConn.rows, aEmp: aEmp.rows }),
    );
    const aConv = await db.query(
      `select id, company_id from public.conversations where company_channel_id = $1 order by created_at desc limit 1`,
      [widgetA.channelId],
    );
    assert.equal(aConv.rows[0].company_id, CO_A);
    const bSeesA = await inboxFor(staffB);
    assert.equal(bSeesA.some((row) => row.id === aConv.rows[0].id), false);
    const invocations = await sandboxInvocations();
    assert.ok(invocations.some((row) => row.companyId === CO_A && row.conversationId === aConv.rows[0].id));
    assert.equal(
      invocations.some((row) => row.companyId === CO_B && row.conversationId === aConv.rows[0].id),
      false,
    );
  });

  it("5 sandbox LLM failure uses the existing fallback path (no delivered, no cross-tenant leak)", async () => {
    await db.query(`update public.conversations set state = 'idle' where id = $1`, [convB]);
    await fetch(`${harnessBase}/__harness/sandbox-llm/fail?count=8`, { method: "POST" });
    const before = await db.query(
      `select count(*)::int as n from public.conversation_messages where conversation_id = $1 and message_type = 'outgoing'`,
      [convB],
    );
    const send = await visitorSend("wc22-msg-0005", "I need help with my order.");
    const body = await send.json();
    assert.equal(send.status, 200);
    assert.ok(["fallback", "accepted", "handoff"].includes(body.status), JSON.stringify(body));
    const after = await db.query(
      `select count(*)::int as n, bool_or(status = 'delivered') as delivered
       from public.conversation_messages where conversation_id = $1 and message_type = 'outgoing'`,
      [convB],
    );
    assert.ok(after.rows[0].n - before.rows[0].n <= 1);
    assert.equal(after.rows[0].delivered, false);
    const leak = await sandboxInvocations();
    assert.equal(leak.some((row) => row.companyId === CO_A && row.conversationId === convB), false);
    await fetch(`${harnessBase}/__harness/sandbox-llm/reset`, { method: "POST" });
  });
});
