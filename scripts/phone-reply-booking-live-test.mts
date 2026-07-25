/**
 * Live WhatsApp booking flow verification:
 * - Existing customer -> Create Booking
 * - New customer -> Create Customer -> Create Booking
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createConversationServices } from "../lib/ai-conversation/src/index.ts";
import { createChannelRegistryServices } from "../lib/channel-registry/src/index.ts";
import { createChannelPlatformServices } from "../lib/channel-platform/src/index.ts";
import {
  createAutomationPlatformServices,
  createSupabaseBookingServicePort,
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

const env: Record<string, string> = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

type SqlTraceEntry = { scenario: string; op: string; input: unknown };
type ScenarioResult = {
  scenario: string;
  pass: boolean;
  phone?: string;
  lookupStatus?: string;
  bookingId?: string;
  bookingDate?: string;
  customerExists?: boolean;
  createCustomerCalled?: boolean;
  createBookingCalled?: boolean;
  currentNodeId?: string | null;
  runStatus?: string;
  sqlTrace?: SqlTraceEntry[];
  steps?: string[];
  error?: string;
};

const sqlTrace: SqlTraceEntry[] = [];
const results: ScenarioResult[] = [];

function buttonReply(waUser: string, phoneNumberId: string, id: string, title: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { phone_number_id: phoneNumberId },
      contacts: [{ profile: { name: "Booking Verify" }, wa_id: waUser }],
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
      contacts: [{ profile: { name: "Booking Verify" }, wa_id: waUser }],
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

function wrapTracedServices(client: ReturnType<typeof createClient>, scenario: string) {
  const resolveActor = (companyId: string) => resolveCompanyActorUserId(client, companyId);
  const baseCustomer = createSupabaseCustomerServicePort(client, { resolveActorUserIdForCompany: resolveActor });
  const baseBooking = createSupabaseBookingServicePort(client, { resolveActorUserIdForCompany: resolveActor });

  const customerService = {
    findCustomer: async (input: Parameters<typeof baseCustomer.findCustomer>[0]) => {
      sqlTrace.push({ scenario, op: "findCustomer", input });
      return baseCustomer.findCustomer(input);
    },
    createCustomer: async (input: Parameters<typeof baseCustomer.createCustomer>[0]) => {
      sqlTrace.push({ scenario, op: "createCustomer", input });
      return baseCustomer.createCustomer(input);
    },
    updateCustomer: async (input: Parameters<typeof baseCustomer.updateCustomer>[0]) => {
      sqlTrace.push({ scenario, op: "updateCustomer", input });
      return baseCustomer.updateCustomer(input);
    },
  };

  const bookingService = {
    findBooking: async (input: Parameters<typeof baseBooking.findBooking>[0]) => {
      sqlTrace.push({ scenario, op: "findBooking", input });
      return baseBooking.findBooking(input);
    },
    createBooking: async (input: Parameters<typeof baseBooking.createBooking>[0]) => {
      sqlTrace.push({ scenario, op: "createBooking", input });
      return baseBooking.createBooking(input);
    },
    updateBooking: async (input: Parameters<typeof baseBooking.updateBooking>[0]) => {
      sqlTrace.push({ scenario, op: "updateBooking", input });
      return baseBooking.updateBooking(input);
    },
    cancelBooking: async (input: Parameters<typeof baseBooking.cancelBooking>[0]) => {
      sqlTrace.push({ scenario, op: "cancelBooking", input });
      return baseBooking.cancelBooking(input);
    },
  };

  return { customerService, bookingService };
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

async function routeText(
  router: { routeWebhook: (...args: unknown[]) => Promise<{ kind: string; result?: { automationRunId?: string } }> },
  ctx: unknown,
  target: { companyId: string; companyChannelId: string; phoneNumberId: string },
  waUser: string,
  text: string,
  aiAssistantId: string,
) {
  return router.routeWebhook(ctx, {
    companyId: target.companyId,
    companyChannelId: target.companyChannelId,
    channelKey: "whatsapp",
    rawPayload: textReply(waUser, target.phoneNumberId, text),
    executeAi: false,
    aiAssistantId,
  });
}

async function cleanupConflictingBookings(
  client: ReturnType<typeof createClient>,
  companyId: string,
  actorUserId: string,
) {
  const { data: bookings } = await client
    .from("bookings")
    .select("id, booking_date")
    .eq("user_id", actorUserId)
    .eq("doctor_id", "dr1")
    .eq("service", "Consultation");

  for (const booking of bookings ?? []) {
    const date = new Date(String(booking.booking_date));
    if (date.getUTCFullYear() === 2027 && date.getUTCMonth() === 4 && date.getUTCDate() === 2) {
      await client.from("bookings").delete().eq("id", booking.id);
    }
  }
}

async function runScenario(
  client: ReturnType<typeof createClient>,
  ctx: { userId: string; companyId: string; isSuperAdmin: boolean; hasPermission: () => boolean },
  target: { companyId: string; companyChannelId: string; phoneNumberId: string },
  scenario: "existing" | "new",
  phone: string,
  aiAssistantId: string,
  actorUserId: string,
) {
  const waUser = `1555${String(Date.now()).slice(-7)}${scenario.length}`;
  const steps: string[] = [];
  await cleanupConflictingBookings(client, target.companyId, actorUserId);
  const { customerService, bookingService } = wrapTracedServices(client, scenario);

  const automationServices = createAutomationPlatformServices(client, {
    actionDeps: { customerService, bookingService },
  });
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

  let lastRunId: string | undefined;
  let errorMessage: string | undefined;

  try {
    steps.push("hi");
    await channelPlatform.router.routeWebhook(ctx as never, {
      companyId: target.companyId,
      companyChannelId: target.companyChannelId,
      channelKey: "whatsapp",
      rawPayload: textReply(waUser, target.phoneNumberId, "hi"),
      executeAi: false,
      aiAssistantId,
    });

    steps.push("book");
    await channelPlatform.router.routeWebhook(ctx as never, {
      companyId: target.companyId,
      companyChannelId: target.companyChannelId,
      channelKey: "whatsapp",
      rawPayload: buttonReply(waUser, target.phoneNumberId, "book", "Book Appointment"),
      executeAi: false,
      aiAssistantId,
    });

    steps.push(`phone:${phone}`);
    let route = await routeText(channelPlatform.router, ctx, target, waUser, phone, aiAssistantId);
    lastRunId = route.kind === "inbound" ? route.result?.automationRunId : lastRunId;

    if (scenario === "new") {
      steps.push("name:Test User");
      route = await routeText(channelPlatform.router, ctx, target, waUser, "Test User", aiAssistantId);
      lastRunId = route.kind === "inbound" ? route.result?.automationRunId : lastRunId;

      steps.push("sex:Male");
      route = await routeText(channelPlatform.router, ctx, target, waUser, "Male", aiAssistantId);
      lastRunId = route.kind === "inbound" ? route.result?.automationRunId : lastRunId;

      steps.push("email:test@example.com");
      route = await routeText(channelPlatform.router, ctx, target, waUser, "test@example.com", aiAssistantId);
      lastRunId = route.kind === "inbound" ? route.result?.automationRunId : lastRunId;
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const run = await loadLatestRun(client, target.companyId, lastRunId);
  const scenarioSql = sqlTrace.filter((entry) => entry.scenario === scenario);
  const createCustomerCalled = scenarioSql.some((entry) => entry.op === "createCustomer");
  const createBookingCalled = scenarioSql.some((entry) => entry.op === "createBooking");
  const bookingId = run?.variables?.booking_id as string | undefined;
  const bookingDate = run?.variables?.booking_date as string | undefined;

  const pass =
    createBookingCalled &&
    Boolean(bookingId) &&
    (scenario === "existing"
      ? (run?.variables?.lookup as { status?: string } | undefined)?.status === "found"
      : createCustomerCalled && (run?.variables?.lookup as { status?: string } | undefined)?.status === "not_found");

  results.push({
    scenario,
    pass,
    phone,
    lookupStatus: (run?.variables?.lookup as { status?: string } | undefined)?.status,
    bookingId,
    bookingDate,
    customerExists: (run?.variables?.customer as { exists?: boolean } | undefined)?.exists,
    createCustomerCalled,
    createBookingCalled,
    currentNodeId: run?.current_node_id,
    runStatus: run?.status,
    sqlTrace: scenarioSql,
    steps,
    error: errorMessage,
  });
}

async function main() {
  const { client, userId } = await signIn();
  await client.rpc("_demo_set_triggers", { enabled: false });

  const { data: flow } = await client.from("automation_flows").select("*").eq("id", FLOW_ID).single();
  const { data: binding } = await client
    .from("company_channel_automation_bindings")
    .select("company_channel_id")
    .eq("automation_flow_id", FLOW_ID)
    .eq("is_enabled", true)
    .limit(1)
    .maybeSingle();
  const { data: channel } = await client.from("company_channels").select("*").eq("id", binding!.company_channel_id).single();
  const { data: assistantRow } = await client.from("ai_assistant_settings").select("id").eq("company_id", flow!.company_id).limit(1).maybeSingle();

  const ctx = { userId, companyId: flow!.company_id as string, isSuperAdmin: true, hasPermission: () => true };
  const target = {
    companyId: flow!.company_id as string,
    companyChannelId: channel!.id as string,
    phoneNumberId: String(channel!.configuration?.phoneNumberId),
  };

  const actorUserId = (await resolveCompanyActorUserId(client, flow!.company_id as string)) ?? userId;

  await runScenario(client, ctx, target, "new", `+20199${String(Date.now()).slice(-7)}`, assistantRow!.id, actorUserId);
  await runScenario(client, ctx, target, "existing", "01011404109", assistantRow!.id, actorUserId);

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
  writeFileSync(resolve(outDir, "phone-reply-booking-live-test-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.passed !== report.total) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
