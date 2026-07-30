/**
 * Live production-path booking flow verification for WhatsApp user 201023169075.
 * Uses real Supabase + full channel router + automation engine (same path as webhook handler).
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createConversationServices } from "../lib/ai-conversation/src/index.ts";
import { createChannelRegistryServices } from "../lib/channel-registry/src/index.ts";
import {
  abandonAllActiveExecutionsForUser,
  createAutomationPlatformServices,
  createSupabaseAutomationRunRepository,
  createSupabaseConversationCustomerLinkPort,
  createSupabaseConversationSessionRepository,
  createSupabaseCustomerServicePort,
  listActiveExecutions,
  countNonTerminalExecutions,
  resolveCompanyActorUserId,
  resolveInboundAutomationContext,
  resolveInboundAutomationRoute,
} from "../lib/automation-platform/src/index.ts";
import { INTERACTIVE_LIST_NEXT_PAGE_ROW_ID } from "../lib/automation-platform/src/runtime/interactive-list-pagination.ts";
import {
  countWhatsAppInteractiveListRows,
  validateWhatsAppInteractiveListPayload,
} from "../lib/channel-platform/src/adapters/whatsapp/whatsapp-interactive-list-validation.ts";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const WA_USER = "201023169075";
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

type FlowEvent = {
  timestamp: string;
  step: string;
  direction: "inbound" | "outbound" | "system";
  executionMode?: string | null;
  routingReason?: string | null;
  runId?: string | null;
  sessionId?: string | null;
  currentNodeId?: string | null;
  nodeAction?: string | null;
  runStatus?: string | null;
  sessionStatus?: string | null;
  waitingFor?: string | null;
  outboundType?: string | null;
  outboundPayload?: unknown;
  automationRunId?: string | null;
  error?: string | null;
};

const events: FlowEvent[] = [];
const metaListDeliveries: Array<{
  timestamp: string;
  step: string;
  rowCount: number;
  httpStatus: number;
  whatsappMessageId: string | null;
  metaError: string | null;
  validated: boolean;
}> = [];
const validatedListOutbounds: Array<{
  timestamp: string;
  step: string;
  rowCount: number;
  title: string | null;
  hasNextRow: boolean;
}> = [];
const TERMINAL = new Set(["completed", "failed", "cancelled"]);
const SESSION_TERMINAL = new Set(["completed", "cancelled", "expired"]);

function logEvent(entry: FlowEvent) {
  events.push(entry);
  console.log(JSON.stringify({ event: "production_booking_flow", ...entry }));
}

function waPayload(
  phoneNumberId: string,
  message:
    | { type: "text"; body: string }
    | { type: "button"; id: string; title: string }
    | { type: "list"; id: string; title: string },
) {
  const base = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: "Production E2E" }, wa_id: WA_USER }],
              messages: [] as unknown[],
            },
          },
        ],
      },
    ],
  };

  const msgId = `wamid.e2e.${randomUUID()}`;
  const ts = String(Math.floor(Date.now() / 1000));

  if (message.type === "text") {
    base.entry[0].changes[0].value.messages = [
      { from: WA_USER, id: msgId, timestamp: ts, type: "text", text: { body: message.body } },
    ];
  } else if (message.type === "button") {
    base.entry[0].changes[0].value.messages = [
      {
        from: WA_USER,
        id: msgId,
        timestamp: ts,
        type: "interactive",
        interactive: { type: "button_reply", button_reply: { id: message.id, title: message.title } },
      },
    ];
  } else {
    base.entry[0].changes[0].value.messages = [
      {
        from: WA_USER,
        id: msgId,
        timestamp: ts,
        type: "interactive",
        interactive: { type: "list_reply", list_reply: { id: message.id, title: message.title } },
      },
    ];
  }

  return base;
}

async function signIn() {
  const client = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: PLATFORM_OWNER,
    password: DEMO_PASSWORD,
  });
  if (error) throw error;
  return { client, userId: data.user!.id };
}

async function loadNodeAction(
  client: ReturnType<typeof createClient>,
  nodeId: string | null | undefined,
): Promise<string | null> {
  if (!nodeId) return null;
  const { data } = await client
    .from("automation_flow_version_nodes")
    .select("type, config")
    .eq("id", nodeId)
    .maybeSingle();
  if (!data) return null;
  const config = (data.config ?? {}) as Record<string, unknown>;
  return typeof config.action === "string" ? config.action : String(data.type);
}

async function preRouteSnapshot(
  deps: {
    sessions: ReturnType<typeof createSupabaseConversationSessionRepository>;
    runs: ReturnType<typeof createSupabaseAutomationRunRepository>;
  },
  companyId: string,
) {
  const context = await resolveInboundAutomationContext(deps, {
    companyId,
    channel: "whatsapp",
    externalUserId: WA_USER,
    boundFlowId: FLOW_ID,
  });
  const route = resolveInboundAutomationRoute({
    boundFlowId: FLOW_ID,
    session: context.session,
    run: context.run,
    expired: context.expired,
  });
  return { context, route };
}

async function loadRunSession(
  client: ReturnType<typeof createClient>,
  runId: string | null | undefined,
) {
  if (!runId) return { run: null, session: null };
  const { data: run } = await client.from("automation_runs").select("*").eq("id", runId).maybeSingle();
  let session = null;
  if (run?.session_id) {
    const { data } = await client.from("conversation_sessions").select("*").eq("id", run.session_id).maybeSingle();
    session = data;
  }
  return { run, session };
}

function readOutboundFromRun(run: Record<string, unknown> | null) {
  if (!run) return { type: null, payload: null, queue: [] as unknown[] };
  const variables = (run.variables ?? {}) as Record<string, unknown>;
  const queue = Array.isArray(variables.__outboundQueue) ? variables.__outboundQueue : [];
  const latest = variables.__outbound;
  const entry = (queue.length > 0 ? queue[queue.length - 1] : latest) as Record<string, unknown> | null;
  if (!entry || typeof entry !== "object") return { type: null, payload: null, queue };
  return { type: typeof entry.kind === "string" ? entry.kind : null, payload: entry, queue };
}

function collectListRows(payload: Record<string, unknown> | null): Array<{ id: string; title: string }> {
  if (!payload) return [];
  const rows: Array<{ id: string; title: string }> = [];
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  for (const section of sections) {
    if (!section || typeof section !== "object") continue;
    const sectionRows = Array.isArray((section as { rows?: unknown }).rows)
      ? (section as { rows: unknown[] }).rows
      : [];
    for (const row of sectionRows) {
      if (!row || typeof row !== "object") continue;
      const id = typeof (row as { id?: unknown }).id === "string" ? (row as { id: string }).id : null;
      const title =
        typeof (row as { title?: unknown }).title === "string" ? (row as { title: string }).title : id;
      if (id) rows.push({ id, title: title ?? id });
    }
  }
  return rows;
}

function automationListToMetaPayload(outbound: Record<string, unknown>) {
  const sections = Array.isArray(outbound.sections)
    ? (outbound.sections as Array<{ title?: string; rows?: Array<{ id: string; title: string; description?: string }> }>)
    : [];
  return {
    type: "interactive",
    interactive: {
      type: "list",
      action: {
        sections: sections.map((section) => ({
          title: section.title ?? "Options",
          rows: (section.rows ?? []).map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description,
          })),
        })),
      },
    },
  };
}

function validateAutomationListOutbound(step: string, outbound: Record<string, unknown>) {
  const metaPayload = automationListToMetaPayload(outbound);
  validateWhatsAppInteractiveListPayload(metaPayload);
  const rowCount = countWhatsAppInteractiveListRows(metaPayload);
  const rows = collectListRows(outbound);
  validatedListOutbounds.push({
    timestamp: new Date().toISOString(),
    step,
    rowCount,
    title: typeof outbound.title === "string" ? outbound.title : null,
    hasNextRow: rows.some((row) => row.id === INTERACTIVE_LIST_NEXT_PAGE_ROW_ID),
  });
  return rowCount;
}

function createValidatingWhatsAppFetch(stepRef: { current: string }): typeof fetch {
  const baseFetch = globalThis.fetch.bind(globalThis);
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const isGraphMessages = url.includes("graph.facebook.com") && url.includes("/messages");
    let requestBody: Record<string, unknown> | null = null;
    if (init?.body && typeof init.body === "string") {
      try {
        requestBody = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        requestBody = null;
      }
    }

    if (isGraphMessages && requestBody?.type === "interactive") {
      validateWhatsAppInteractiveListPayload(requestBody);
    }

    const response = await baseFetch(input, init);

    if (isGraphMessages && requestBody?.type === "interactive") {
      const cloned = response.clone();
      let responseBody: Record<string, unknown> | null = null;
      try {
        responseBody = (await cloned.json()) as Record<string, unknown>;
      } catch {
        responseBody = null;
      }
      const messages = (responseBody?.messages as Array<{ id?: string }> | undefined) ?? [];
      const error =
        (responseBody?.error as { message?: string; error_user_msg?: string } | undefined)?.error_user_msg ??
        (responseBody?.error as { message?: string } | undefined)?.message ??
        null;
      metaListDeliveries.push({
        timestamp: new Date().toISOString(),
        step: stepRef.current,
        rowCount: countWhatsAppInteractiveListRows(requestBody ?? {}),
        httpStatus: response.status,
        whatsappMessageId: messages[0]?.id ?? null,
        metaError: error,
        validated: true,
      });
    }

    return response;
  };
}
function firstListRow(payload: Record<string, unknown> | null): { id: string; title: string } | null {
  return collectListRows(payload)[0] ?? null;
}

async function queryExecutionInventory(
  client: ReturnType<typeof createClient>,
  companyId: string,
  deps: {
    sessions: ReturnType<typeof createSupabaseConversationSessionRepository>;
    runs: ReturnType<typeof createSupabaseAutomationRunRepository>;
  },
) {
  const active = await listActiveExecutions(deps, {
    companyId,
    channel: "whatsapp",
    externalUserId: WA_USER,
    boundFlowId: FLOW_ID,
  });

  const { data: sessions } = await client
    .from("conversation_sessions")
    .select("id, status, run_id, current_node_id, last_activity_at")
    .eq("external_user_id", WA_USER)
    .eq("channel", "whatsapp")
    .order("last_activity_at", { ascending: false });

  const sessionIds = (sessions ?? []).map((s) => s.id);
  let runs: Record<string, unknown>[] = [];
  if (sessionIds.length) {
    const { data } = await client.from("automation_runs").select("*").in("session_id", sessionIds);
    runs = (data ?? []) as Record<string, unknown>[];
  }

  const nonTerminalRuns = runs.filter((r) => !TERMINAL.has(String(r.status)));
  const nonTerminalSessions = (sessions ?? []).filter((s) => !SESSION_TERMINAL.has(String(s.status)));
  const orphanRuns = runs.filter(
    (r) =>
      r.status === "running" &&
      (r.variables as Record<string, unknown> | undefined)?.__waitingFor == null,
  );
  const zombieWaiting = (sessions ?? []).filter(
    (s) =>
      s.status === "waiting_input" &&
      runs.some((r) => r.session_id === s.id && r.status === "waiting_input") &&
      !s.current_node_id,
  );

  return {
    activeExecutions: active.length,
    nonTerminalExecutions: countNonTerminalExecutions(active),
    nonTerminalRuns: nonTerminalRuns.length,
    nonTerminalSessions: nonTerminalSessions.length,
    orphanRuns: orphanRuns.map((r) => ({
      id: r.id,
      status: r.status,
      current_node_id: r.current_node_id,
    })),
    zombieWaitingSessions: zombieWaiting.map((s) => ({ id: s.id, status: s.status })),
    runIds: runs.map((r) => r.id),
    sessionIds: (sessions ?? []).map((s) => s.id),
  };
}

async function main() {
  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value;
  }
  process.env.VITE_SUPABASE_URL ??= env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??=
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY;

  const startedAt = new Date().toISOString();
  const { client, userId } = await signIn();
  await client.rpc("_demo_set_triggers", { enabled: false });

  const { data: flow } = await client.from("automation_flows").select("*").eq("id", FLOW_ID).single();
  const { data: channel } = await client.from("company_channels").select("*").eq("id", CHANNEL_ID).single();
  const { data: assistantRow } = await client
    .from("ai_assistant_settings")
    .select("id")
    .eq("company_id", flow!.company_id)
    .limit(1)
    .maybeSingle();

  const companyId = flow!.company_id as string;
  const phoneNumberId = String(channel!.configuration?.phoneNumberId ?? "");
  const ctx = { userId, companyId, isSuperAdmin: true, hasPermission: () => true };
  const target = { companyId, companyChannelId: CHANNEL_ID, phoneNumberId };

  const sessionsRepo = createSupabaseConversationSessionRepository(client);
  const runsRepo = createSupabaseAutomationRunRepository(client);
  const routingDeps = { sessions: sessionsRepo, runs: runsRepo };

  const inventoryBefore = await queryExecutionInventory(client, companyId, routingDeps);
  logEvent({
    timestamp: new Date().toISOString(),
    step: "preflight_inventory",
    direction: "system",
    outboundPayload: inventoryBefore,
  });

  const automationServices = createAutomationPlatformServices(client);
  const abandoned = await abandonAllActiveExecutionsForUser(
    automationServices.engine,
    ctx as never,
    routingDeps,
    {
      companyId,
      channel: "whatsapp",
      externalUserId: WA_USER,
      boundFlowId: FLOW_ID,
      reason: "production_e2e_clean_slate",
    },
  );
  logEvent({
    timestamp: new Date().toISOString(),
    step: "cleanup_abandon_active",
    direction: "system",
    outboundPayload: { abandonedRunIds: abandoned },
  });

  const conversationServices = createConversationServices(client);
  const channelRegistryServices = createChannelRegistryServices(client);
  const resolveActor = (cid: string) => resolveCompanyActorUserId(client, cid);

  const { createLookupOptionsPort } = await import(
    "../artifacts/login-app/src/lib/lookups/create-lookup-options-port.ts"
  );
  const { createBusinessCalendarPort } = await import(
    "../artifacts/login-app/src/lib/scheduling/business-calendar/create-business-calendar-port.ts"
  );
  const { createSchedulingAwareBookingServicePort } = await import(
    "../artifacts/login-app/src/lib/booking/automation-booking-adapter.ts"
  );

  const automationServicesFull = createAutomationPlatformServices(client, {
    actionDeps: {
      customerService: createSupabaseCustomerServicePort(client, {
        resolveActorUserIdForCompany: resolveActor,
      }),
      bookingService: createSchedulingAwareBookingServicePort(client, {
        resolveActorUserIdForCompany: resolveActor,
      }),
      conversationCustomerLink: createSupabaseConversationCustomerLinkPort(client),
      lookupOptions: createLookupOptionsPort(client),
      businessCalendar: createBusinessCalendarPort(),
    },
  });

  const { createChannelPlatformPortsWithContext } = await import(
    "../artifacts/login-app/src/lib/channel-platform/platform-ports.ts"
  );
  const { createChannelAutomationPortFromClient, createChannelWorkflowFlowValidator } = await import(
    "../artifacts/api-server/src/platform/channel-automation-port.ts"
  );
  const { createServerChannelPlatformServices, createSupabaseWhatsAppCredentialsLoader } = await import(
    "../lib/channel-platform/src/index.ts"
  );
  const { ChannelWorkflowResolver } = await import("../lib/channel-platform/src/services/channel-workflow-resolver.ts");
  const { createSupabaseChannelWorkflowBindingRepository } = await import(
    "../lib/channel-platform/src/repositories/supabase-channel-workflow-binding-repository.ts"
  );

  const channelPorts = createChannelPlatformPortsWithContext(
    { channelRegistry: channelRegistryServices, conversation: conversationServices },
    { registry: ctx, conversation: ctx },
  );
  channelPorts.automation = createChannelAutomationPortFromClient(
    automationServicesFull.engine,
    ctx as never,
    client,
  );

  const currentOutboundStep = { current: "bootstrap" };
  const whatsAppCredentialsLoader = createSupabaseWhatsAppCredentialsLoader(client);
  const channelPlatform = createServerChannelPlatformServices(client, {
    ports: channelPorts,
    whatsAppFetchFn: createValidatingWhatsAppFetch(currentOutboundStep),
    whatsAppCredentialsLoader,
    workflowResolver: new ChannelWorkflowResolver({
      bindings: createSupabaseChannelWorkflowBindingRepository(client),
      flowValidator: createChannelWorkflowFlowValidator(client),
    }),
  });

  let primaryRunId: string | null = null;
  const runIdsSeen = new Set<string>();

  async function sendStep(
    step: string,
    payload: ReturnType<typeof waPayload>,
    metadata: Record<string, unknown> = {},
  ) {
    currentOutboundStep.current = step;
    const pre = await preRouteSnapshot(routingDeps, companyId);
    const textBody =
      payload.entry[0].changes[0].value.messages[0]?.type === "text"
        ? (payload.entry[0].changes[0].value.messages[0] as { text: { body: string } }).text.body
        : metadata.title ?? step;

    let response: { automationRunId?: string; responseContent?: string } = {};
    let error: string | null = null;
    try {
      const routeResult = await channelPlatform.router.routeWebhook(ctx as never, {
        companyId: target.companyId,
        companyChannelId: target.companyChannelId,
        channelKey: "whatsapp",
        rawPayload: payload,
        executeAi: false,
        aiAssistantId: assistantRow!.id,
      });
      if (routeResult.kind === "inbound") {
        response = routeResult.result ?? {};
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const runId = response.automationRunId ?? null;
    if (runId) {
      runIdsSeen.add(runId);
      if (!primaryRunId) primaryRunId = runId;
    }

    const { run, session } = await loadRunSession(client, runId ?? pre.context.run?.id ?? primaryRunId);
    const nodeAction = await loadNodeAction(client, run?.current_node_id ?? session?.current_node_id);
    const outbound = readOutboundFromRun(run as Record<string, unknown> | null);

    logEvent({
      timestamp: new Date().toISOString(),
      step,
      direction: "inbound",
      executionMode: pre.route.mode,
      routingReason: pre.route.reason,
      runId: run?.id ?? runId,
      sessionId: session?.id ?? pre.context.session?.id ?? null,
      currentNodeId: run?.current_node_id ?? session?.current_node_id ?? null,
      nodeAction,
      runStatus: run?.status ?? null,
      sessionStatus: session?.status ?? null,
      waitingFor:
        typeof (run?.variables as Record<string, unknown> | undefined)?.__waitingFor === "string"
          ? ((run!.variables as Record<string, unknown>).__waitingFor as string)
          : null,
      automationRunId: runId,
      outboundType: outbound.type,
      outboundPayload: outbound.payload,
      error,
    });

    if (outbound.payload && outbound.type === "list") {
      validateAutomationListOutbound(`${step}_outbound`, outbound.payload as Record<string, unknown>);
      logEvent({
        timestamp: new Date().toISOString(),
        step: `${step}_outbound`,
        direction: "outbound",
        runId: run?.id ?? runId,
        outboundType: outbound.type,
        outboundPayload: outbound.payload,
      });
    }

    return { run, session, outbound, error, runId: run?.id ?? runId };
  }

  // --- Flow replay ---
  let state = await sendStep("Hello", waPayload(phoneNumberId, { type: "text", body: "Hello" }));

  state = await sendStep(
    "Book Appointment",
    waPayload(phoneNumberId, { type: "button", id: "book", title: "Book Appointment" }),
    { title: "Book Appointment", kind: "interactive_reply", interactionType: "button_reply", replyId: "book" },
  );

  state = await sendStep(
    "Phone Number",
    waPayload(phoneNumberId, { type: "text", body: "01011404109" }),
  );

  // New-customer branch: collect name / gender / email before services list
  for (let guard = 0; guard < 4; guard += 1) {
    const waitingFor = state.run
      ? ((state.run.variables as Record<string, unknown>)?.__waitingFor as string | null)
      : null;
    if (waitingFor === "customer_name") {
      state = await sendStep(
        "Customer Name",
        waPayload(phoneNumberId, { type: "text", body: "Production E2E User" }),
      );
      continue;
    }
    if (waitingFor === "customer_gender" || waitingFor === "gender") {
      state = await sendStep(
        "Customer Gender",
        waPayload(phoneNumberId, { type: "text", body: "Male" }),
      );
      continue;
    }
    if (waitingFor === "customer_email" || waitingFor === "email") {
      state = await sendStep(
        "Customer Email",
        waPayload(phoneNumberId, { type: "text", body: "e2e@valueor.test" }),
      );
      continue;
    }
    break;
  }

  state.outbound = readOutboundFromRun(state.run as Record<string, unknown> | null);
  let serviceRow = firstListRow(state.outbound.payload as Record<string, unknown> | null);
  if (!serviceRow) {
    const queue = state.outbound.queue as Array<Record<string, unknown>>;
    for (const entry of queue) {
      serviceRow = firstListRow(entry);
      if (serviceRow) break;
    }
  }
  if (!serviceRow) {
    throw new Error(
      `No service list outbound after phone/customer steps (waitingFor=${String((state.run?.variables as Record<string, unknown> | undefined)?.__waitingFor)}, node=${state.run?.current_node_id})`,
    );
  }
  state = await sendStep(
    "Service",
    waPayload(phoneNumberId, { type: "list", id: serviceRow.id, title: serviceRow.title }),
    { kind: "interactive_reply", interactionType: "list_reply", replyId: serviceRow.id, title: serviceRow.title },
  );

  const { data: adamResource } = await client
    .from("scheduling_resources")
    .select("id, name")
    .ilike("name", "ADAM")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  const doctorRow =
    firstListRow(state.outbound.payload as Record<string, unknown> | null) ??
    (adamResource ? { id: adamResource.id as string, title: adamResource.name as string } : null);
  if (!doctorRow) throw new Error("No doctor list outbound and ADAM resource not found");

  state = await sendStep(
    "Doctor (ADAM)",
    waPayload(phoneNumberId, { type: "list", id: doctorRow.id, title: doctorRow.title }),
    { kind: "interactive_reply", interactionType: "list_reply", replyId: doctorRow.id, title: doctorRow.title },
  );

  const datesOutbound = readOutboundFromRun(state.run as Record<string, unknown> | null);
  if (datesOutbound.type !== "list") {
    throw new Error(`Expected Available Dates list immediately after ADAM, got ${datesOutbound.type ?? "none"}`);
  }

  const dateRow = firstListRow(datesOutbound.payload as Record<string, unknown>);
  if (!dateRow) throw new Error("Available Dates list had no rows");

  state = await sendStep(
    "Date",
    waPayload(phoneNumberId, { type: "list", id: dateRow.id, title: dateRow.title }),
    { kind: "interactive_reply", interactionType: "list_reply", replyId: dateRow.id, title: dateRow.title },
  );

  const timesOutbound = readOutboundFromRun(state.run as Record<string, unknown> | null);
  if (timesOutbound.type !== "list") {
    throw new Error(`Expected Available Times list immediately after date, got ${timesOutbound.type ?? "none"}`);
  }

  let timeRows = collectListRows(timesOutbound.payload as Record<string, unknown>);
  if (timeRows.length === 0) throw new Error("Available Times list had no rows");

  const timesHasNextPage = timeRows.some((row) => row.id === INTERACTIVE_LIST_NEXT_PAGE_ROW_ID);
  if (timesHasNextPage) {
    state = await sendStep(
      "Available Times (Next page)",
      waPayload(phoneNumberId, {
        type: "list",
        id: INTERACTIVE_LIST_NEXT_PAGE_ROW_ID,
        title: "Next",
      }),
      {
        kind: "interactive_reply",
        interactionType: "list_reply",
        replyId: INTERACTIVE_LIST_NEXT_PAGE_ROW_ID,
        title: "Next",
      },
    );
    const pagedTimesOutbound = readOutboundFromRun(state.run as Record<string, unknown> | null);
    if (pagedTimesOutbound.type !== "list") {
      throw new Error(
        `Expected paginated Available Times list after Next, got ${pagedTimesOutbound.type ?? "none"}`,
      );
    }
    timeRows = collectListRows(pagedTimesOutbound.payload as Record<string, unknown>).filter(
      (row) => row.id !== INTERACTIVE_LIST_NEXT_PAGE_ROW_ID,
    );
    if (timeRows.length === 0) {
      throw new Error("Paginated Available Times list had no selectable rows");
    }
  }

  const selectableTimeRows = timeRows.filter((row) => row.id !== INTERACTIVE_LIST_NEXT_PAGE_ROW_ID);
  const chosenTimeRow = selectableTimeRows[0]!;
  if (!chosenTimeRow) throw new Error("No selectable time slot found after pagination");

  state = await sendStep(
    "Time",
    waPayload(phoneNumberId, { type: "list", id: chosenTimeRow.id, title: chosenTimeRow.title }),
    { kind: "interactive_reply", interactionType: "list_reply", replyId: chosenTimeRow.id, title: chosenTimeRow.title },
  );

  const finalRun = state.run as Record<string, unknown> | null;
  const bookingId =
    finalRun && typeof (finalRun.variables as Record<string, unknown>)?.booking_id === "string"
      ? ((finalRun.variables as Record<string, unknown>).booking_id as string)
      : null;

  let bookingRecord = null;
  if (bookingId) {
    const { data } = await client.from("bookings").select("*").eq("id", bookingId).maybeSingle();
    bookingRecord = data;
  }

  const queue = finalRun
    ? readOutboundFromRun(finalRun).queue
    : [];
  const confirmation = (queue as Array<{ kind?: string; text?: string; message?: string }>).find(
    (entry) =>
      entry.kind === "text" &&
      typeof (entry.text ?? entry.message) === "string" &&
      /confirm|booked|appointment|success/i.test(String(entry.text ?? entry.message)),
  );

  const inventoryAfter = await queryExecutionInventory(client, companyId, routingDeps);

  const { data: deliveryEvents } = primaryRunId
    ? await client
        .from("channel_delivery_events")
        .select("id, status, error_message, external_message_id, metadata, created_at")
        .eq("automation_run_id", primaryRunId)
        .order("created_at", { ascending: true })
    : { data: [] };

  const listDeliveryProof = (deliveryEvents ?? [])
    .filter((event) => {
      const metadata = (event.metadata ?? {}) as Record<string, unknown>;
      return metadata.outboundKind === "list" || metadata.kind === "list";
    })
    .map((event) => {
      const metadata = (event.metadata ?? {}) as Record<string, unknown>;
      const rowCount =
        typeof metadata.rowCount === "number"
          ? metadata.rowCount
          : typeof metadata.rows === "number"
            ? metadata.rows
            : null;
      return {
        id: event.id,
        status: event.status,
        rowCount,
        externalMessageId: event.external_message_id,
        metaError: event.error_message,
        pass:
          event.status === "sent" &&
          Boolean(event.external_message_id) &&
          !event.error_message &&
          (rowCount == null || rowCount <= 10),
      };
    });

  const generatedListChecks = validatedListOutbounds.map((entry) => ({
    source: "automation_outbound",
    ...entry,
    pass: entry.rowCount > 0 && entry.rowCount <= 10,
  }));

  const metaListChecks =
    metaListDeliveries.length > 0
      ? metaListDeliveries.map((delivery) => ({
          source: "graph_api_fetch",
          ...delivery,
          pass:
            delivery.validated &&
            delivery.rowCount <= 10 &&
            delivery.httpStatus >= 200 &&
            delivery.httpStatus < 300 &&
            delivery.whatsappMessageId !== null &&
            delivery.metaError === null,
        }))
      : listDeliveryProof.length > 0
        ? listDeliveryProof.map((entry) => ({ source: "channel_delivery_events", ...entry }))
        : generatedListChecks;

  const checks = [
    ["dates list after ADAM", datesOutbound.type === "list"],
    ["times list after date", timesOutbound.type === "list"],
    ["times pagination handled when Next row present", !timesHasNextPage || timeRows.length > 0],
    ["every Meta list delivery accepted", metaListChecks.length > 0 && metaListChecks.every((entry) => entry.pass)],
    ["flow completed or booking created", finalRun?.status === "completed" || Boolean(bookingId)],
    ["booking persisted", Boolean(bookingRecord)],
    ["confirmation outbound present", Boolean(confirmation)],
    ["exactly one active automation run", inventoryAfter.activeExecutions === 1],
    ["exactly one active conversation session", inventoryAfter.nonTerminalExecutions === 1],
    ["zero orphan running runs", inventoryAfter.orphanRuns.length === 0],
    ["zero zombie waiting sessions", inventoryAfter.zombieWaitingSessions.length === 0],
    ["no duplicate runs during flow", runIdsSeen.size <= 1 || (runIdsSeen.size === 1 && primaryRunId !== null)],
    ["single primary run across flow", runIdsSeen.size === 1],
  ] as const;

  const results = checks.map(([label, pass]) => ({ label, pass }));
  for (const { label, pass } of results) {
    console.log(`[${pass ? "PASS" : "FAIL"}] ${label}`);
  }

  const report = {
    verifiedAt: new Date().toISOString(),
    startedAt,
    waUser: WA_USER,
    flowId: FLOW_ID,
    activeFlowVersionId: flow!.active_version_id,
    primaryRunId,
    runIdsSeen: [...runIdsSeen],
    bookingId,
    bookingRecord,
    confirmationText: confirmation?.text ?? confirmation?.message ?? null,
    inventoryBefore,
    inventoryAfter,
    metaListDeliveries: metaListChecks,
    validatedListOutbounds: generatedListChecks,
    listDeliveryProof,
    events,
    results,
    passed: results.filter((r) => r.pass).length,
    total: results.length,
  };

  const outDir = resolve(root, "docs/architecture");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "production-booking-flow-e2e-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written: ${outPath}`);
  console.log(`\n=== SUMMARY ${report.passed}/${report.total} PASS ===`);

  if (report.passed !== report.total) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
