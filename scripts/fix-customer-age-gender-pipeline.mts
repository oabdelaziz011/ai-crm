/**
 * 1. Apply migration 141 (age/gender columns)
 * 2. Fix draft workflow nodes (gender list, ask age, create customer)
 * 3. Publish new version
 * 4. Run end-to-end WhatsApp simulation and verify DB row
 *
 * Run: node --import tsx/esm scripts/fix-customer-age-gender-pipeline.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createAutomationPlatformServices } from "../lib/automation-platform/src/index.ts";
import { createConversationServices } from "../lib/ai-conversation/src/index.ts";
import { createChannelRegistryServices } from "../lib/channel-registry/src/index.ts";
import { createChannelPlatformServices } from "../lib/channel-platform/src/index.ts";
import {
  createSupabaseCustomerServicePort,
  resolveCompanyActorUserId,
} from "../lib/automation-platform/src/index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const LIST_GENDER_NODE_ID = "5227f658-74d5-44a5-a30e-4256ea9eb111";
const ASK_AGE_NODE_ID = "53e0708a-3dcd-4bda-9892-7b55425f1cdf";
const CREATE_CUSTOMER_NODE_ID = "26471c3d-0527-4d76-a5ce-4bb22c8df013";
const DEMO_PASSWORD = "DemoVault2026!";
const PLATFORM_OWNER = "demo-platform@vaultos.local";

const env: Record<string, string> = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

type Report = Record<string, unknown>;

const report: Report = { startedAt: new Date().toISOString() };

async function resolvePostgresConnectionStrings(databaseUrl: string): Promise<string[]> {
  const parsed = new URL(databaseUrl.replace(/^postgresql:/, "postgres:"));
  const host = parsed.hostname;
  const password = parsed.password;
  const projectRef = host.match(/^db\.([^.]+)\.supabase\.co$/)?.[1] ?? "lfbtnskmvibikalsxwsm";
  const region = "eu-north-1";
  const poolerSession = `postgresql://postgres.${projectRef}:${password}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
  const poolerTxn = `postgresql://postgres.${projectRef}:${password}@aws-0-${region}.pooler.supabase.com:6543/postgres`;

  const attempts = [poolerSession, poolerTxn, databaseUrl];

  try {
    const { lookup } = await import("node:dns/promises");
    const resolved = await lookup(host, { all: true });
    for (const entry of resolved) {
      const resolvedHost = entry.family === 6 ? `[${entry.address}]` : entry.address;
      attempts.push(databaseUrl.replace(`@${host}:`, `@${resolvedHost}:`));
    }
  } catch {
    /* optional */
  }

  return [...new Set(attempts)];
}

async function applyMigration141() {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing from .env");

  const sb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { error: probeError } = await sb.from("customers").select("age, gender").limit(1);
  if (!probeError) {
    report.migration141 = { applied: true, skipped: true, reason: "columns already exist" };
    return [{ column_name: "age" }, { column_name: "gender" }];
  }

  const sql = readFileSync(resolve(root, "supabase/migrations/141_customer_age_gender.sql"), "utf8");
  const connectionStrings = await resolvePostgresConnectionStrings(databaseUrl);
  let lastError: unknown;

  for (const connectionString of connectionStrings) {
    const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      await client.query(sql);
      const { rows } = await client.query(`
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = 'public' and table_name = 'customers'
          and column_name in ('age', 'gender')
        order by column_name
      `);
      report.migration141 = {
        applied: true,
        via: connectionString.includes("pooler") ? "pooler" : "direct",
        columns: rows,
      };
      await client.end();
      return rows;
    } catch (error) {
      lastError = error;
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }

  throw lastError ?? new Error("Failed to apply migration 141");
}

function buildGenderListConfig(existing: Record<string, unknown>) {
  const rows = [
    { id: "male", title: "Male", value: "male", description: "" },
    { id: "female", title: "Female", value: "female", description: "" },
  ];
  return {
    ...existing,
    action: "send_list",
    builderType: "list",
    inputKey: "customer_gender",
    saveAs: "customer_gender",
    rows,
    sections: [{ title: "Options", rows }],
  };
}

function buildAskAgeConfig(existing: Record<string, unknown>) {
  return {
    ...existing,
    action: "wait_for_input",
    builderType: "ask_question",
    inputKey: "customer_age",
    saveAs: "customer_age",
  };
}

function buildCreateCustomerConfig(existing: Record<string, unknown>) {
  return {
    ...existing,
    action: "create_customer",
    builderType: "create_customer",
    nameField: "customer_name",
    phoneField: "customer_phone",
    emailField: existing.emailField ?? "",
    ageField: "customer_age",
    genderField: "customer_gender",
  };
}

async function updateDraftNodes(sb: ReturnType<typeof createClient>) {
  const updates: Array<{ id: string; label: string; config: Record<string, unknown> }> = [];

  for (const [id, label, build] of [
    [LIST_GENDER_NODE_ID, "list_gender", buildGenderListConfig],
    [ASK_AGE_NODE_ID, "ask_age", buildAskAgeConfig],
    [CREATE_CUSTOMER_NODE_ID, "create_customer", buildCreateCustomerConfig],
  ] as const) {
    const { data: before, error: readErr } = await sb.from("automation_nodes").select("config").eq("id", id).single();
    if (readErr) throw readErr;
    const nextConfig = build((before?.config ?? {}) as Record<string, unknown>);
    const { error: updateErr } = await sb.from("automation_nodes").update({ config: nextConfig }).eq("id", id);
    if (updateErr) throw updateErr;
    updates.push({ id, label, config: nextConfig });
  }

  report.draftUpdates = updates;
  return updates;
}

async function publishFlow(sb: ReturnType<typeof createClient>, userId: string, companyId: string) {
  const { data: flow } = await sb.from("automation_flows").select("*").eq("id", FLOW_ID).single();
  const [{ data: nodes }, { data: edges }] = await Promise.all([
    sb.from("automation_nodes").select("*").eq("flow_id", FLOW_ID),
    sb.from("automation_edges").select("*").eq("flow_id", FLOW_ID),
  ]);

  const snapshot = {
    name: String(flow!.name ?? "Workflow"),
    description: String(flow!.description ?? ""),
    triggerType: flow!.trigger_type,
    metadata: flow!.metadata ?? {},
    nodes: (nodes ?? []).map((node) => ({
      id: node.id,
      type: node.type,
      config: node.config ?? {},
      positionX: Number(node.position_x ?? 0),
      positionY: Number(node.position_y ?? 0),
    })),
    edges: (edges ?? []).map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.source_node_id,
      targetNodeId: edge.target_node_id,
      condition: edge.condition ?? {},
    })),
  };

  const automation = createAutomationPlatformServices(sb);
  const ctx = { userId, companyId, isSuperAdmin: true, hasPermission: () => true };
  const published = await automation.publish.publish(ctx, {
    flowId: FLOW_ID,
    releaseNotes: "Fix customer age/gender pipeline: customer_age binding, gender list rows (v16)",
    snapshot,
  });

  report.publish = {
    versionId: published.version.id,
    versionNumber: published.version.version_number,
    activeVersionId: published.flow.active_version_id,
  };
  return published;
}

function waPayload(
  waUser: string,
  phoneNumberId: string,
  message: Record<string, unknown>,
) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { phone_number_id: phoneNumberId },
          contacts: [{ profile: { name: "Age Gender Verify" }, wa_id: waUser }],
          messages: [{ from: waUser, id: `wamid.${randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)), ...message }],
        },
      }],
    }],
  };
}

function textReply(waUser: string, phoneNumberId: string, text: string) {
  return waPayload(waUser, phoneNumberId, { type: "text", text: { body: text } });
}

function buttonReply(waUser: string, phoneNumberId: string, id: string, title: string) {
  return waPayload(waUser, phoneNumberId, {
    type: "interactive",
    interactive: { type: "button_reply", button_reply: { id, title } },
  });
}

function listReply(waUser: string, phoneNumberId: string, id: string, title: string) {
  return waPayload(waUser, phoneNumberId, {
    type: "interactive",
    interactive: { type: "list_reply", list_reply: { id, title } },
  });
}

async function runWhatsAppE2E(sb: ReturnType<typeof createClient>, userId: string) {
  try {
    await sb.rpc("_demo_set_triggers", { enabled: false });
  } catch {
    /* optional */
  }

  const { data: flow } = await sb.from("automation_flows").select("*").eq("id", FLOW_ID).single();
  const { data: binding } = await sb
    .from("company_channel_automation_bindings")
    .select("company_channel_id")
    .eq("automation_flow_id", FLOW_ID)
    .eq("is_enabled", true)
    .limit(1)
    .maybeSingle();
  const { data: channel } = await sb.from("company_channels").select("*").eq("id", binding!.company_channel_id).single();
  const { data: assistantRow } = await sb
    .from("ai_assistant_settings")
    .select("id")
    .eq("company_id", flow!.company_id)
    .limit(1)
    .maybeSingle();

  const ctx = { userId, companyId: flow!.company_id as string, isSuperAdmin: true, hasPermission: () => true };
  const target = {
    companyId: flow!.company_id as string,
    companyChannelId: channel!.id as string,
    phoneNumberId: String((channel!.configuration as Record<string, unknown>)?.phoneNumberId),
  };

  const waUser = `2010${String(Date.now()).slice(-8)}`;
  const testPhone = `010${String(Date.now()).slice(-8)}`;
  const testName = `E2E Verify ${randomUUID().slice(0, 6)}`;

  const createCustomerCalls: unknown[] = [];
  const baseCustomer = createSupabaseCustomerServicePort(sb, {
    resolveActorUserIdForCompany: (companyId) => resolveCompanyActorUserId(sb, companyId),
  });
  const customerService = {
    findCustomer: baseCustomer.findCustomer.bind(baseCustomer),
    createCustomer: async (input: Parameters<typeof baseCustomer.createCustomer>[0]) => {
      createCustomerCalls.push(input);
      return baseCustomer.createCustomer(input);
    },
    updateCustomer: baseCustomer.updateCustomer.bind(baseCustomer),
  };

  const automationServices = createAutomationPlatformServices(sb, { actionDeps: { customerService } });
  const conversationServices = createConversationServices(sb);
  const channelRegistryServices = createChannelRegistryServices(sb);

  const { createChannelPlatformPortsWithContext } = await import("../artifacts/login-app/src/lib/channel-platform/platform-ports.ts");
  const { createChannelAutomationPortFromClient } = await import("../artifacts/api-server/src/platform/channel-automation-port.ts");
  const { ChannelWorkflowResolver } = await import("../lib/channel-platform/src/services/channel-workflow-resolver.ts");
  const { createSupabaseChannelWorkflowBindingRepository } = await import("../lib/channel-platform/src/repositories/supabase-channel-workflow-binding-repository.ts");
  const { createChannelWorkflowFlowValidator } = await import("../artifacts/api-server/src/platform/channel-automation-port.ts");

  const channelPorts = createChannelPlatformPortsWithContext(
    { channelRegistry: channelRegistryServices, conversation: conversationServices },
    { registry: ctx, conversation: ctx },
  );
  channelPorts.automation = createChannelAutomationPortFromClient(automationServices.engine, ctx as never, sb);

  const channelPlatform = createChannelPlatformServices(sb, {
    ports: channelPorts,
    whatsAppFetchFn: async () =>
      ({ ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.out" }] }) }) as Response,
    workflowResolver: new ChannelWorkflowResolver({
      bindings: createSupabaseChannelWorkflowBindingRepository(sb),
      flowValidator: createChannelWorkflowFlowValidator(sb),
    }),
  });

  const route = (payload: unknown) =>
    channelPlatform.router.routeWebhook(ctx as never, {
      companyId: target.companyId,
      companyChannelId: target.companyChannelId,
      channelKey: "whatsapp",
      rawPayload: payload,
      executeAi: false,
      aiAssistantId: assistantRow!.id,
    });

  await route(textReply(waUser, target.phoneNumberId, "Hello"));
  await route(buttonReply(waUser, target.phoneNumberId, "book", "Book Appointment"));
  await route(textReply(waUser, target.phoneNumberId, testPhone));
  await route(textReply(waUser, target.phoneNumberId, testName));
  await route(listReply(waUser, target.phoneNumberId, "female", "Female"));
  let afterAgeRunId: string | undefined;
  try {
    const afterAge = await route(textReply(waUser, target.phoneNumberId, "55"));
    afterAgeRunId =
      afterAge.kind === "inbound" ? (afterAge.result as { automationRunId?: string })?.automationRunId : undefined;
  } catch (error) {
    report.e2ePostCreateError = error instanceof Error ? error.message : String(error);
  }

  const { data: recentRuns } = await sb
    .from("automation_runs")
    .select("*")
    .eq("company_id", target.companyId)
    .eq("flow_id", FLOW_ID)
    .order("started_at", { ascending: false })
    .limit(10);

  const run =
    (afterAgeRunId ? recentRuns?.find((candidate) => candidate.id === afterAgeRunId) : undefined) ??
    recentRuns?.find((candidate) => {
      const phone = (candidate.variables as Record<string, unknown> | null)?.customer_phone;
      return phone === testPhone;
    }) ??
    recentRuns?.[0] ??
    null;

  const vars = (run?.variables ?? {}) as Record<string, unknown>;
  const customerId = (vars.customer as { id?: string } | undefined)?.id;

  const { data: customerRow } = customerId
    ? await sb.from("customers").select("id, name, phone, age, gender, created_at").eq("id", customerId).single()
    : { data: null };

  const e2e = {
    waUser,
    testPhone,
    testName,
    runId: run?.id,
    runStatus: run?.status,
    flowVersionId: run?.flow_version_id,
    variables: {
      customer_name: vars.customer_name,
      customer_phone: vars.customer_phone,
      customer_age: vars.customer_age,
      customer_gender: vars.customer_gender,
    },
    createCustomerPayload: createCustomerCalls[0] ?? null,
    customerRow,
    customerDetailsDisplay: customerRow
      ? {
          gender: customerRow.gender === "female" ? "Female" : customerRow.gender,
          age: customerRow.age,
        }
      : null,
    pass:
      vars.customer_gender === "female" &&
      (vars.customer_age === "55" || vars.customer_age === 55) &&
      createCustomerCalls.length > 0 &&
      (createCustomerCalls[0] as { gender?: string; age?: number }).gender === "female" &&
      (createCustomerCalls[0] as { age?: number }).age === 55 &&
      customerRow?.gender === "female" &&
      customerRow?.age === 55,
  };

  report.e2e = e2e;
  return e2e;
}

async function main() {
  report.migration141 = await applyMigration141();

  const sb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
    email: PLATFORM_OWNER,
    password: DEMO_PASSWORD,
  });
  if (authErr) throw authErr;
  const userId = auth.user!.id;

  await updateDraftNodes(sb);

  const { data: flow } = await sb.from("automation_flows").select("company_id").eq("id", FLOW_ID).single();
  await publishFlow(sb, userId, flow!.company_id as string);

  const e2e = await runWhatsAppE2E(sb, userId);
  report.finishedAt = new Date().toISOString();
  report.pass = e2e.pass;

  const outDir = resolve(root, "docs/architecture");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "customer-age-gender-pipeline-fix-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.error("\nWrote:", outPath);

  if (!e2e.pass) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
