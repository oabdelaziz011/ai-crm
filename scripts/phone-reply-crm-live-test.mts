/**
 * Live WhatsApp book flow verification: existing + new customer after phone reply.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createConversationServices } from "../lib/ai-conversation/src/index.ts";
import { createChannelRegistryServices } from "../lib/channel-registry/src/index.ts";
import { createChannelPlatformServices } from "../lib/channel-platform/src/index.ts";
import {
  createAutomationPlatformServices,
  createSupabaseCustomerServicePort,
  resolveCompanyActorUserId,
} from "../lib/automation-platform/src/index.ts";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const DEMO_PASSWORD = "DemoVault2026!";
const PLATFORM_OWNER = "demo-platform@vaultos.local";

const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

type ScenarioResult = {
  scenario: string;
  phone: string;
  pass: boolean;
  lookupStatus?: string;
  customerExists?: boolean;
  customerPhoneVar?: string;
  currentNodeId?: string | null;
  runStatus?: string;
  waitingInput?: string | null;
  findCustomerCalled?: boolean;
  sqlTrace?: unknown[];
  error?: string;
};

function evaluateScenarioPass(
  scenario: string,
  scenarioSql: unknown[],
  run: { variables?: Record<string, unknown>; current_node_id?: string | null; waiting_input?: string | null } | null,
  errorMessage?: string,
): boolean {
  const findCustomerCalled = scenarioSql.some((entry) => (entry as { op?: string }).op === "findCustomer");
  const lookupStatus = (run?.variables?.lookup as { status?: string } | undefined)?.status;
  const progressedPastFindCustomer =
    lookupStatus === "found" ||
    lookupStatus === "not_found" ||
    run?.current_node_id !== "d2365fd5-5a8c-41f6-94ff-03a7d7af005b";
  const reachedExistingBranch =
    lookupStatus === "found" || (errorMessage?.includes("booking service") ?? false);
  const reachedNewCustomerBranch = lookupStatus === "not_found";

  return (
    findCustomerCalled &&
    progressedPastFindCustomer &&
    (scenario === "existing" ? reachedExistingBranch : reachedNewCustomerBranch)
  );
}

async function loadLatestRun(client: ReturnType<typeof createClient>, companyId: string, runId?: string) {
  if (runId) {
    const { data } = await client.from("automation_runs").select("*").eq("id", runId).single();
    if (data) return data;
  }
  const { data } = await client
    .from("automation_runs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

const sqlTrace: unknown[] = [];
const results: ScenarioResult[] = [];

function buttonReply(waUser: string, phoneNumberId: string, id: string, title: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { phone_number_id: phoneNumberId },
      contacts: [{ profile: { name: "CRM Verify" }, wa_id: waUser }],
      messages: [{ from: waUser, id: `wamid.book-${randomUUID()}`, timestamp: "1", type: "interactive",
        interactive: { type: "button_reply", button_reply: { id, title } } }],
      },
    }],
  }],
  };
}

function textReply(waUser: string, phoneNumberId: string, text: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { phone_number_id: phoneNumberId },
      contacts: [{ profile: { name: "CRM Verify" }, wa_id: waUser }],
      messages: [{ from: waUser, id: `wamid.phone-${randomUUID()}`, timestamp: "1", type: "text", text: { body: text } }],
      },
    }],
  }],
  };
}

async function signIn() {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: PLATFORM_OWNER, password: DEMO_PASSWORD });
  if (error) throw error;
  return { client, userId: data.user!.id };
}

async function runScenario(
  client: ReturnType<typeof createClient>,
  ctx: { userId: string; companyId: string; isSuperAdmin: boolean; hasPermission: () => boolean },
  target: { companyId: string; companyChannelId: string; phoneNumberId: string },
  scenario: string,
  phone: string,
) {
  const waUser = `1555${String(Date.now()).slice(-7)}${scenario.length}`;
  const base = createSupabaseCustomerServicePort(client, {
    resolveActorUserIdForCompany: (companyId) => resolveCompanyActorUserId(client, companyId),
  });
  const customerService = {
    findCustomer: async (input: Parameters<typeof base.findCustomer>[0]) => {
      sqlTrace.push({ scenario, op: "findCustomer", input });
      return base.findCustomer(input);
    },
    createCustomer: async (input: Parameters<typeof base.createCustomer>[0]) => {
      sqlTrace.push({ scenario, op: "createCustomer", input });
      return base.createCustomer(input);
    },
    updateCustomer: async (input: Parameters<typeof base.updateCustomer>[0]) => {
      sqlTrace.push({ scenario, op: "updateCustomer", input });
      return base.updateCustomer(input);
    },
  };

  const automationServices = createAutomationPlatformServices(client, { actionDeps: { customerService } });
  const conversationServices = createConversationServices(client);
  const channelRegistryServices = createChannelRegistryServices(client);

  const { createChannelPlatformPortsWithContext } = await import("../artifacts/login-app/src/lib/channel-platform/platform-ports.ts");
  const { createChannelAutomationPortFromClient, createChannelWorkflowFlowValidator } = await import("../artifacts/api-server/src/platform/channel-automation-port.ts");
  const { ChannelWorkflowResolver } = await import("../lib/channel-platform/src/services/channel-workflow-resolver.ts");
  const { createSupabaseChannelWorkflowBindingRepository } = await import("../lib/channel-platform/src/repositories/supabase-channel-workflow-binding-repository.ts");

  const channelPorts = createChannelPlatformPortsWithContext(
    { channelRegistry: channelRegistryServices, conversation: conversationServices },
    { registry: ctx, conversation: ctx },
  );
  channelPorts.automation = createChannelAutomationPortFromClient(automationServices.engine, ctx as never, client);

  const channelPlatform = createChannelPlatformServices(client, {
    ports: channelPorts,
    whatsAppFetchFn: async () => ({ ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.out" }] }) }) as Response,
    workflowResolver: new ChannelWorkflowResolver({
      bindings: createSupabaseChannelWorkflowBindingRepository(client),
      flowValidator: createChannelWorkflowFlowValidator(client),
    }),
  });

  const { data: assistantRow } = await client.from("ai_assistant_settings").select("id").eq("company_id", target.companyId).limit(1).maybeSingle();

  try {
    await channelPlatform.router.routeWebhook(ctx as never, {
      companyId: target.companyId,
      companyChannelId: target.companyChannelId,
      channelKey: "whatsapp",
      rawPayload: textReply(waUser, target.phoneNumberId, "hi"),
      executeAi: false,
      aiAssistantId: assistantRow!.id,
    });
    await channelPlatform.router.routeWebhook(ctx as never, {
      companyId: target.companyId,
      companyChannelId: target.companyChannelId,
      channelKey: "whatsapp",
      rawPayload: buttonReply(waUser, target.phoneNumberId, "book", "Book Appointment"),
      executeAi: false,
      aiAssistantId: assistantRow!.id,
    });
    const phoneRoute = await channelPlatform.router.routeWebhook(ctx as never, {
      companyId: target.companyId,
      companyChannelId: target.companyChannelId,
      channelKey: "whatsapp",
      rawPayload: textReply(waUser, target.phoneNumberId, phone),
      executeAi: false,
      aiAssistantId: assistantRow!.id,
    });

    const runId = phoneRoute.kind === "inbound" ? phoneRoute.result?.automationRunId : undefined;
    const run = await loadLatestRun(client, target.companyId, runId);
    const scenarioSql = sqlTrace.filter((entry) => (entry as { scenario?: string }).scenario === scenario);
    results.push({
      scenario,
      phone,
      pass: evaluateScenarioPass(scenario, scenarioSql, run, undefined),
      lookupStatus: (run?.variables?.lookup as { status?: string } | undefined)?.status,
      customerExists: (run?.variables?.customer as { exists?: boolean } | undefined)?.exists,
      customerPhoneVar: run?.variables?.customer_phone as string | undefined,
      currentNodeId: run?.current_node_id,
      runStatus: run?.status,
      waitingInput: (run?.variables?.waitingInput as string | undefined) ?? run?.waiting_input,
      findCustomerCalled: scenarioSql.some((entry) => (entry as { op?: string }).op === "findCustomer"),
      sqlTrace: scenarioSql,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const run = await loadLatestRun(client, target.companyId);
    const scenarioSql = sqlTrace.filter((entry) => (entry as { scenario?: string }).scenario === scenario);
    results.push({
      scenario,
      phone,
      pass: evaluateScenarioPass(scenario, scenarioSql, run, message),
      lookupStatus: (run?.variables?.lookup as { status?: string } | undefined)?.status,
      customerExists: (run?.variables?.customer as { exists?: boolean } | undefined)?.exists,
      customerPhoneVar: run?.variables?.customer_phone as string | undefined,
      currentNodeId: run?.current_node_id,
      runStatus: run?.status,
      waitingInput: (run?.variables?.waitingInput as string | undefined) ?? run?.waiting_input,
      findCustomerCalled: scenarioSql.some((entry) => (entry as { op?: string }).op === "findCustomer"),
      sqlTrace: scenarioSql,
      error: message,
    });
  }
}

async function main() {
  const { client, userId } = await signIn();
  await client.rpc("_demo_set_triggers", { enabled: false });

  const { data: flow } = await client.from("automation_flows").select("*").eq("id", FLOW_ID).single();
  const { data: binding } = await client.from("company_channel_automation_bindings").select("company_channel_id").eq("automation_flow_id", FLOW_ID).eq("is_enabled", true).limit(1).maybeSingle();
  const { data: channel } = await client.from("company_channels").select("*").eq("id", binding!.company_channel_id).single();

  const ctx = { userId, companyId: flow!.company_id as string, isSuperAdmin: true, hasPermission: () => true };
  const target = {
    companyId: flow!.company_id as string,
    companyChannelId: channel!.id as string,
    phoneNumberId: String(channel!.configuration?.phoneNumberId),
  };

  await runScenario(client, ctx, target, "existing", "01011404109");
  await runScenario(client, ctx, target, "new", `+20199${String(Date.now()).slice(-7)}`);

  const report = {
    testedAt: new Date().toISOString(),
    activeVersionId: flow!.active_version_id,
    results,
    sqlTrace,
    passed: results.filter((r) => r.pass).length,
    total: results.length,
  };

  const outDir = resolve(root, "docs/architecture");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "phone-reply-crm-live-test-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.passed !== report.total) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
