/**
 * Live WhatsApp routing test for migrated Switch workflow (CNV-000010 flow).
 * Exercises book / pricing / support button replies through channel platform.
 *
 * Run: node --import tsx/esm scripts/cnv-000010-switch-live-test.mts
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
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const DEMO_PASSWORD = "DemoVault2026!";
const PLATFORM_OWNER = "demo-platform@vaultos.local";

type Scenario = {
  id: string;
  buttonId: string;
  buttonTitle: string;
  expectPattern: RegExp;
  expectLabel: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: "book",
    buttonId: "book",
    buttonTitle: "Book Appointment",
    expectPattern: /what is your phone number/i,
    expectLabel: 'prompt "what is your phone number?"',
  },
  {
    id: "pricing",
    buttonId: "pricing",
    buttonTitle: "Pricing",
    expectPattern: /choose a doctor|pick the option/i,
    expectLabel: "Pricing flow (list)",
  },
  {
    id: "support",
    buttonId: "support",
    buttonTitle: "Talk to Support",
    expectPattern: /for supporting please call :19666/i,
    expectLabel: 'message "For supporting please call :19666"',
  },
];

type TraceStep = {
  scenario: string;
  step: string;
  pass: boolean;
  detail: string;
  evidence?: Record<string, unknown>;
};

const trace: TraceStep[] = [];
const graphRequests: Array<{ scenario: string; url: string; body: unknown }> = [];

function record(scenario: string, step: string, pass: boolean, detail: string, evidence?: Record<string, unknown>) {
  trace.push({ scenario, step, pass, detail, evidence });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${scenario} / ${step} — ${detail}`);
}

function createMockWhatsAppFetch(scenario: string, waUser: string) {
  return async (url: string, init?: RequestInit) => {
    graphRequests.push({ scenario, url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    if (String(url).includes("/messages")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          messaging_product: "whatsapp",
          contacts: [{ input: waUser, wa_id: waUser }],
          messages: [{ id: `wamid.outbound-${scenario}-${randomUUID().slice(0, 8)}` }],
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

function textInboundPayload(messageId: string, phoneNumberId: string, waUser: string, text: string) {
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
              contacts: [{ profile: { name: "Switch Live Test" }, wa_id: waUser }],
              messages: [
                {
                  from: waUser,
                  id: messageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function buttonReplyPayload(messageId: string, phoneNumberId: string, waUser: string, scenario: Scenario) {
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
              contacts: [{ profile: { name: "Switch Live Test" }, wa_id: waUser }],
              messages: [
                {
                  from: waUser,
                  id: messageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "interactive",
                  interactive: {
                    type: "button_reply",
                    button_reply: { id: scenario.buttonId, title: scenario.buttonTitle },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function extractOutboundTexts(scenario: string): string[] {
  return graphRequests
    .filter((req) => req.scenario === scenario && String(req.url).includes("/messages"))
    .flatMap((req) => {
      const body = req.body as Record<string, unknown>;
      const texts: string[] = [];
      if (typeof body.text === "object" && body.text && typeof (body.text as { body?: string }).body === "string") {
        texts.push((body.text as { body: string }).body);
      }
      const interactive = body.interactive as Record<string, unknown> | undefined;
      if (interactive?.body && typeof (interactive.body as { text?: string }).text === "string") {
        texts.push((interactive.body as { text: string }).text);
      }
      if (interactive?.action && typeof interactive.action === "object") {
        const action = interactive.action as { buttons?: Array<{ reply?: { title?: string } }> };
        for (const btn of action.buttons ?? []) {
          if (btn.reply?.title) texts.push(btn.reply.title);
        }
      }
      return texts;
    });
}

async function resolveFlowTarget(client: ReturnType<typeof createClient>) {
  const { data: flow, error: flowError } = await client
    .from("automation_flows")
    .select("id, status, active_version_id, company_id")
    .eq("id", FLOW_ID)
    .is("deleted_at", null)
    .maybeSingle();
  if (flowError) throw flowError;
  if (!flow?.active_version_id || flow.status !== "active") {
    throw new Error(`Flow ${FLOW_ID} is not active/published.`);
  }

  const { data: binding, error: bindingError } = await client
    .from("company_channel_automation_bindings")
    .select("company_channel_id, is_enabled")
    .eq("automation_flow_id", FLOW_ID)
    .eq("is_enabled", true)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (bindingError) throw bindingError;
  if (!binding?.company_channel_id) {
    throw new Error(`No enabled channel binding for flow ${FLOW_ID}.`);
  }

  const { data: channel, error: channelError } = await client
    .from("company_channels")
    .select("id, configuration, is_enabled")
    .eq("id", binding.company_channel_id)
    .maybeSingle();
  if (channelError) throw channelError;
  if (!channel?.is_enabled) throw new Error(`Channel ${binding.company_channel_id} disabled.`);

  const phoneNumberId = String(channel.configuration?.phoneNumberId ?? "");
  if (!phoneNumberId) throw new Error("Missing phoneNumberId on channel.");

  return {
    companyId: flow.company_id as string,
    companyChannelId: channel.id as string,
    flowId: flow.id as string,
    activeVersionId: flow.active_version_id as string,
    phoneNumberId,
  };
}

async function runScenario(
  client: ReturnType<typeof createClient>,
  ctx: ReturnType<typeof makeContext>,
  target: Awaited<ReturnType<typeof resolveFlowTarget>>,
  scenario: Scenario,
) {
  const waUser = `1555${String(Date.now()).slice(-6)}${scenario.id.length}`;
  const conversationServices = createConversationServices(client);
  const channelRegistryServices = createChannelRegistryServices(client);
  const automationServices = createAutomationPlatformServices(client);

  const { createChannelPlatformPortsWithContext } = await import(
    "../artifacts/login-app/src/lib/channel-platform/platform-ports.ts"
  );
  const { createChannelAutomationPortFromClient, createChannelWorkflowFlowValidator } = await import(
    "../artifacts/api-server/src/platform/channel-automation-port.ts"
  );
  const { ChannelWorkflowResolver } = await import("../lib/channel-platform/src/services/channel-workflow-resolver.ts");
  const { createSupabaseChannelWorkflowBindingRepository } = await import(
    "../lib/channel-platform/src/repositories/supabase-channel-workflow-binding-repository.ts"
  );

  const channelPorts = createChannelPlatformPortsWithContext(
    { channelRegistry: channelRegistryServices, conversation: conversationServices },
    { registry: ctx, conversation: ctx },
  );
  channelPorts.automation = createChannelAutomationPortFromClient(automationServices.engine, ctx as never, client);

  const bindingRepository = createSupabaseChannelWorkflowBindingRepository(client);
  const workflowResolver = new ChannelWorkflowResolver({
    bindings: bindingRepository,
    flowValidator: createChannelWorkflowFlowValidator(client),
  });

  const channelPlatform = createChannelPlatformServices(client, {
    ports: channelPorts,
    whatsAppFetchFn: createMockWhatsAppFetch(scenario.id, waUser),
    workflowResolver,
  });

  const { data: assistantRow } = await client
    .from("ai_assistant_settings")
    .select("id")
    .eq("company_id", target.companyId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!assistantRow?.id) throw new Error(`No ai_assistant_settings for company ${target.companyId}.`);

  const kickoffId = `wamid.kickoff-${scenario.id}-${randomUUID()}`;
  const kickoff = await channelPlatform.router.routeWebhook(ctx as never, {
    companyId: target.companyId,
    companyChannelId: target.companyChannelId,
    channelKey: "whatsapp",
    rawPayload: textInboundPayload(kickoffId, target.phoneNumberId, waUser, "hi"),
    executeAi: false,
    aiAssistantId: assistantRow.id,
  });

  const kickoffResult = kickoff.kind === "inbound" ? kickoff.result : null;
  record(
    scenario.id,
    "kickoff",
    Boolean(kickoffResult?.automationRunId),
    `automationRunId=${kickoffResult?.automationRunId ?? "n/a"}`,
    { inboundEventId: kickoffResult?.inboundEventId },
  );

  const replyId = `wamid.reply-${scenario.id}-${randomUUID()}`;
  const replyRoute = await channelPlatform.router.routeWebhook(ctx as never, {
    companyId: target.companyId,
    companyChannelId: target.companyChannelId,
    channelKey: "whatsapp",
    rawPayload: buttonReplyPayload(replyId, target.phoneNumberId, waUser, scenario),
    executeAi: false,
    aiAssistantId: assistantRow.id,
  });

  const replyResult = replyRoute.kind === "inbound" ? replyRoute.result : null;
  record(
    scenario.id,
    "button_reply",
    Boolean(replyResult?.automationRunId),
    `automationRunId=${replyResult?.automationRunId ?? "n/a"}`,
    { inboundEventId: replyResult?.inboundEventId, outboundDeliveryId: replyResult?.outboundDeliveryId },
  );

  const outboundTexts = extractOutboundTexts(scenario.id);
  let deliveryTexts: string[] = [];
  if (replyResult?.outboundDeliveryId) {
    const { data: delivery } = await client
      .from("channel_delivery_events")
      .select("payload")
      .eq("id", replyResult.outboundDeliveryId)
      .maybeSingle();
    const payload = delivery?.payload as Record<string, unknown> | undefined;
    const text =
      (payload?.text as string | undefined) ??
      (payload?.metadata as { outboundPayload?: { text?: string } } | undefined)?.outboundPayload?.text;
    if (text) deliveryTexts.push(text);
  }
  const combined = [...outboundTexts, ...deliveryTexts].join("\n");
  const matched = scenario.expectPattern.test(combined);

  record(scenario.id, "session_resumed", kickoffResult?.automationRunId === replyResult?.automationRunId, `kickoff=${kickoffResult?.automationRunId ?? "n/a"} reply=${replyResult?.automationRunId ?? "n/a"}`);

  record(scenario.id, "expected_response", matched, scenario.expectLabel, {
    outboundTexts,
    deliveryTexts,
    combined,
    pattern: scenario.expectPattern.source,
  });

  let runTrace: Record<string, unknown> | null = null;
  if (replyResult?.automationRunId) {
    const { data: run } = await client
      .from("automation_runs")
      .select("id, status, current_node_id, flow_version_id, variables")
      .eq("id", replyResult.automationRunId)
      .maybeSingle();
    runTrace = run as Record<string, unknown> | null;
    record(
      scenario.id,
      "run_pinned_version",
      run?.flow_version_id === target.activeVersionId,
      `flowVersionId=${run?.flow_version_id ?? "n/a"}`,
      { currentNodeId: run?.current_node_id, variables: run?.variables },
    );
  }

  return {
    scenario: scenario.id,
    waUser,
    kickoffRunId: kickoffResult?.automationRunId,
    replyRunId: replyResult?.automationRunId,
    outboundTexts,
    matched,
    runTrace,
  };
}

async function main() {
  const env = loadSupabaseEnv(root);
  const config = resolveSupabaseConfig(env);
  if (!config) throw new Error("Supabase configuration not found.");

  const { client, userId } = await signIn(config.url, config.key);
  await client.rpc("_demo_set_triggers", { enabled: false });

  const target = await resolveFlowTarget(client);
  const ctx = makeContext(userId, target.companyId);

  const { count: switchInVersion } = await client
    .from("automation_flow_version_nodes")
    .select("id", { count: "exact", head: true })
    .eq("flow_version_id", target.activeVersionId)
    .eq("config->>mode", "switch");

  record("setup", "published_switch_present", (switchInVersion ?? 0) > 0, `switchNodes=${switchInVersion ?? 0}`, {
    activeVersionId: target.activeVersionId,
  });

  const scenarioResults = [];
  for (const scenario of SCENARIOS) {
    scenarioResults.push(await runScenario(client, ctx, target, scenario));
  }

  const passed = trace.filter((t) => t.pass).length;
  const failed = trace.length - passed;

  const report = {
    testedAt: new Date().toISOString(),
    flowId: target.flowId,
    activeVersionId: target.activeVersionId,
    companyChannelId: target.companyChannelId,
    scenarios: scenarioResults,
    trace,
    graphRequests,
    summary: { passed, failed, total: trace.length },
  };

  const outDir = resolve(root, "docs/architecture");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "cnv-000010-switch-live-test-report.json"), JSON.stringify(report, null, 2));

  console.log(`\nSwitch live test: ${passed}/${trace.length} checks passed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
