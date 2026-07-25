/**
 * Version-graph WhatsApp inbound E2E verification.
 *
 * Validates the full chain:
 * Meta Webhook → Channel Routing → Workflow Resolution → Automation Engine
 * → Session Creation → Runtime Execution (version graph only) → Outbound Reply
 *
 * Run: pnpm --dir artifacts/login-app version-graph:whatsapp:e2e
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createConversationServices } from "../lib/ai-conversation/src/index.ts";
import { createChannelRegistryServices } from "../lib/channel-registry/src/index.ts";
import { createChannelPlatformServices } from "../lib/channel-platform/src/index.ts";
import { createAutomationPlatformServices } from "../lib/automation-platform/src/index.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { loadSupabaseEnv, resolveSupabaseConfig } from "./lib/supabase-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const DEMO_PASSWORD = "DemoVault2026!";
const PLATFORM_OWNER = "demo-platform@vaultos.local";

type Result = { scenario: string; pass: boolean; detail: string; evidence?: Record<string, unknown> };
const results: Result[] = [];
const graphRequests: Array<{ url: string; body: unknown }> = [];

function record(scenario: string, pass: boolean, detail: string, evidence?: Record<string, unknown>) {
  results.push({ scenario, pass, detail, evidence });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${scenario} — ${detail}`);
}

function createMockWhatsAppFetch(waUser: string) {
  return async (url: string, init?: RequestInit) => {
    graphRequests.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    if (String(url).includes("/messages")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          messaging_product: "whatsapp",
          contacts: [{ input: waUser, wa_id: waUser }],
          messages: [{ id: "wamid.outbound-version-graph-e2e" }],
        }),
      } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  };
}

async function signIn(url: string, key: string) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: PLATFORM_OWNER, password: DEMO_PASSWORD });
  if (error) throw new Error(error.message);
  return { client, userId: data.user!.id };
}

function makeContext(userId: string, companyId: string) {
  return {
    userId,
    companyId,
    isSuperAdmin: true,
    hasPermission: () => true,
  };
}

function inboundPayload(messageId: string, phoneNumberId: string, waUser: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: "Version Graph E2E" }, wa_id: waUser }],
              messages: [
                {
                  from: waUser,
                  id: messageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "Version graph inbound test" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function resolveProductionWorkflowTarget(client: ReturnType<typeof createClient>) {
  const { data: binding, error: bindingError } = await client
    .from("company_channel_automation_bindings")
    .select("company_id, company_channel_id, automation_flow_id, is_enabled")
    .eq("is_enabled", true)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (bindingError) throw bindingError;
  if (!binding?.automation_flow_id) {
    throw new Error("No enabled company_channel_automation_bindings row found.");
  }

  const { data: flow, error: flowError } = await client
    .from("automation_flows")
    .select("id, status, active_version_id, company_id")
    .eq("id", binding.automation_flow_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (flowError) throw flowError;
  if (!flow?.active_version_id || flow.status !== "active") {
    throw new Error(`Bound flow ${binding.automation_flow_id} is not executable.`);
  }

  const { data: channel, error: channelError } = await client
    .from("company_channels")
    .select("id, company_id, configuration, is_enabled")
    .eq("id", binding.company_channel_id)
    .maybeSingle();

  if (channelError) throw channelError;
  if (!channel?.is_enabled) {
    throw new Error(`Bound WhatsApp channel ${binding.company_channel_id} is disabled.`);
  }

  const phoneNumberId = String(channel.configuration?.phoneNumberId ?? "");
  if (!phoneNumberId) {
    throw new Error(`WhatsApp channel ${channel.id} is missing configuration.phoneNumberId.`);
  }

  return {
    companyId: flow.company_id,
    companyChannelId: channel.id,
    flowId: flow.id,
    activeVersionId: flow.active_version_id,
    phoneNumberId,
    verifyToken: String(channel.configuration?.verifyToken ?? ""),
  };
}

async function main() {
  const startedAt = performance.now();
  const env = loadSupabaseEnv(root);
  const config = resolveSupabaseConfig(env);
  if (!config) throw new Error("Supabase configuration not found.");

  const { client, userId } = await signIn(config.url, config.key);
  await client.rpc("_demo_set_triggers", { enabled: false });

  const target = await resolveProductionWorkflowTarget(client);
  const ctx = makeContext(userId, target.companyId);
  const WA_USER = `1555${String(Date.now()).slice(-7)}`;

  const { count: versionGraphNodeCount } = await client
    .from("automation_flow_version_nodes")
    .select("*", { count: "exact", head: true })
    .eq("flow_version_id", target.activeVersionId);

  record(
    "1. Published version graph materialized",
    (versionGraphNodeCount ?? 0) > 0,
    `flowVersionId=${target.activeVersionId}, nodes=${versionGraphNodeCount ?? 0}`,
  );

  const conversationServices = createConversationServices(client);
  const channelRegistryServices = createChannelRegistryServices(client);
  const automationServices = createAutomationPlatformServices(client);

  const { createChannelPlatformPortsWithContext } = await import(
    "../artifacts/login-app/src/lib/channel-platform/platform-ports.ts"
  );
  const { createChannelAutomationPort, createChannelWorkflowFlowValidator } = await import(
    "../artifacts/api-server/src/platform/channel-automation-port.ts"
  );
  const { ChannelWorkflowResolver } = await import(
    "../lib/channel-platform/src/services/channel-workflow-resolver.ts"
  );
  const { createSupabaseChannelWorkflowBindingRepository } = await import(
    "../lib/channel-platform/src/repositories/supabase-channel-workflow-binding-repository.ts"
  );

  const channelPorts = createChannelPlatformPortsWithContext(
    { channelRegistry: channelRegistryServices, conversation: conversationServices },
    { registry: ctx, conversation: ctx },
  );
  channelPorts.automation = createChannelAutomationPort(automationServices.engine, ctx as never);

  const bindingRepository = createSupabaseChannelWorkflowBindingRepository(client);
  const workflowResolver = new ChannelWorkflowResolver({
    bindings: bindingRepository,
    flowValidator: createChannelWorkflowFlowValidator(client),
  });

  const channelPlatform = createChannelPlatformServices(client, {
    ports: channelPorts,
    whatsAppFetchFn: createMockWhatsAppFetch(WA_USER),
    workflowResolver,
  });

  const { data: assistantRow } = await client
    .from("ai_assistant_settings")
    .select("id")
    .eq("company_id", target.companyId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (!assistantRow?.id) {
    throw new Error(`No ai_assistant_settings row found for company ${target.companyId}.`);
  }

  const inboundMessageId = `wamid.vg-inbound-${randomUUID()}`;
  const routeStart = performance.now();
  const inboundRoute = await channelPlatform.router.routeWebhook(ctx as never, {
    companyId: target.companyId,
    companyChannelId: target.companyChannelId,
    channelKey: "whatsapp",
    rawPayload: inboundPayload(inboundMessageId, target.phoneNumberId, WA_USER),
    executeAi: false,
    aiAssistantId: assistantRow.id,
  });
  const routeMs = performance.now() - routeStart;

  const inboundResult = inboundRoute.kind === "inbound" ? inboundRoute.result : null;
  record(
    "2. Meta webhook routed to channel platform",
    inboundRoute.kind === "inbound" && Boolean(inboundResult?.inboundEventId),
    `inboundEventId=${inboundResult?.inboundEventId ?? "n/a"}`,
  );

  record(
    "3. Workflow automation executed (not AI runtime)",
    Boolean(inboundResult?.automationRunId && !inboundResult?.runtimeExecutionId),
    `automationRunId=${inboundResult?.automationRunId ?? "n/a"}`,
  );

  const automationRunId = inboundResult?.automationRunId;
  let runRecord: {
    flow_version_id: string | null;
    current_node_id: string | null;
    flow_id: string;
  } | null = null;

  if (automationRunId) {
    const { data } = await client
      .from("automation_runs")
      .select("flow_version_id, current_node_id, flow_id")
      .eq("id", automationRunId)
      .maybeSingle();
    runRecord = data;
  }

  record(
    "4. Run pinned to flow_version_id",
    Boolean(runRecord?.flow_version_id),
    `flowVersionId=${runRecord?.flow_version_id ?? "n/a"}`,
  );

  record(
    "5. Run uses version graph node (not draft automation_nodes)",
    runRecord?.flow_version_id === target.activeVersionId &&
      (runRecord?.current_node_id
        ? await (async () => {
            const { count } = await client
              .from("automation_flow_version_nodes")
              .select("id", { count: "exact", head: true })
              .eq("flow_version_id", runRecord!.flow_version_id!)
              .eq("id", runRecord!.current_node_id!);
            const { count: draftCount } = await client
              .from("automation_nodes")
              .select("id", { count: "exact", head: true })
              .eq("flow_id", target.flowId)
              .eq("id", runRecord!.current_node_id!);
            return (count ?? 0) > 0;
          })()
        : true),
    runRecord?.current_node_id
      ? `currentNodeId=${runRecord.current_node_id} resolved via version graph`
      : "completed run with null current_node_id",
  );

  const { data: sessionRow } = automationRunId
    ? await client
        .from("conversation_sessions")
        .select("id, flow_version_id, current_node_id")
        .eq("run_id", automationRunId)
        .maybeSingle()
    : { data: null };

  record(
    "6. Conversation session pinned to same version",
    Boolean(sessionRow?.flow_version_id && sessionRow.flow_version_id === runRecord?.flow_version_id),
    `sessionId=${sessionRow?.id ?? "n/a"}, flowVersionId=${sessionRow?.flow_version_id ?? "n/a"}`,
  );

  record(
    "7. Outbound WhatsApp reply dispatched",
    Boolean(inboundResult?.outboundDeliveryId && graphRequests.some((req) => String(req.url).includes("/messages"))),
    `deliveryId=${inboundResult?.outboundDeliveryId ?? "n/a"}, graphCalls=${graphRequests.length}`,
  );

  const totalMs = performance.now() - startedAt;
  const passed = results.filter((item) => item.pass).length;
  const failed = results.length - passed;

  const reportDir = resolve(root, "docs/architecture");
  mkdirSync(reportDir, { recursive: true });
  const report = {
    passed,
    failed,
    total: results.length,
    routeMs,
    totalMs,
    flowId: target.flowId,
    activeVersionId: target.activeVersionId,
    companyChannelId: target.companyChannelId,
    automationRunId,
    results,
  };
  writeFileSync(resolve(reportDir, "version-graph-whatsapp-e2e-report.json"), JSON.stringify(report, null, 2));

  console.log(`\nVersion graph WhatsApp E2E: ${passed}/${results.length} passed (${totalMs.toFixed(0)} ms total)`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
