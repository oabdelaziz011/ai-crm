/**
 * Step-by-step trace: Date Selection → Available Times send_list → outbound dispatch.
 * Run from lib/automation-platform:
 *   TSX_TSCONFIG_PATH=../../artifacts/login-app/tsconfig.json node --import tsx/esm ../../scripts/trace-date-to-times-path.mts
 */
import { createClient, type SupabaseClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  abandonAllActiveExecutionsForUser,
  createAutomationPlatformServices,
  createSupabaseAutomationRunRepository,
  createSupabaseConversationSessionRepository,
  extractInteractiveSelection,
  mergeConversationVariables,
  mergeVariables,
  resolveLookupFilterValues,
  resolveListNodeSections,
  isListLookupMode,
  readListLookupRuntimeConfig,
  clearLatestOutboundSlot,
  INTERACTIVE_SELECTION_INPUT_KEY,
  resolveCompanyActorUserId,
  createSupabaseBookingServicePort,
  createSupabaseCustomerServicePort,
  createSupabaseConversationCustomerLinkPort,
} from "../lib/automation-platform/src/index.ts";
import { readInteractiveListOutputVariable, resolveInteractiveListStoredRecord } from "../lib/automation-platform/src/runtime/interactive-list-variable.ts";
import { buildInteractiveMenuOutbound } from "../lib/automation-platform/src/runtime/main-menu.ts";
import { readOutboundQueue } from "../lib/automation-platform/src/runtime/outbound-queue.ts";
import { extractAutomationOutboundMessages } from "../lib/channel-platform/src/services/extract-automation-outbound.ts";

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
for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
process.env.VITE_SUPABASE_URL ??= env.SUPABASE_URL;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??=
  env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY;

type TraceStep = Record<string, unknown>;

function printStep(step: TraceStep) {
  console.log(JSON.stringify({ trace: "date_to_times", ...step }, null, 2));
}

function formatError(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: String(error), file: null, function: null, line: null, stack: null };
  }
  const stackLines = error.stack?.split("\n") ?? [];
  const frame = stackLines[1] ?? stackLines[0] ?? "";
  const match = frame.match(/at\s+(?:async\s+)?(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);
  return {
    message: error.message,
    file: match?.[2] ?? null,
    function: match?.[1] ?? null,
    line: match?.[3] ? Number(match[3]) : null,
    stack: error.stack ?? null,
  };
}

async function signIn(client: SupabaseClient) {
  const { data, error } = await client.auth.signInWithPassword({
    email: PLATFORM_OWNER,
    password: DEMO_PASSWORD,
  });
  if (error) throw error;
  return data.user!.id;
}

async function main() {
  const { createLookupOptionsPort } = await import(
    "../artifacts/login-app/src/lib/lookups/create-lookup-options-port.ts"
  );
  const { createBusinessCalendarPort } = await import(
    "../artifacts/login-app/src/lib/scheduling/business-calendar/create-business-calendar-port.ts"
  );

  const client = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const userId = await signIn(client);
  await client.rpc("_demo_set_triggers", { enabled: false });

  const { data: flow } = await client.from("automation_flows").select("*").eq("id", FLOW_ID).single();
  const companyId = flow!.company_id as string;
  const versionId = flow!.active_version_id as string;
  const ctx = { userId, companyId, isSuperAdmin: true, hasPermission: () => true };

  const { data: nodes } = await client
    .from("automation_flow_version_nodes")
    .select("id,type,config")
    .eq("flow_version_id", versionId);
  const datesNode = (nodes ?? []).find((n) => n.config?.lookup === "available_dates");
  const timesNode = (nodes ?? []).find((n) => n.config?.lookup === "available_slots");
  if (!datesNode || !timesNode) throw new Error("Could not locate dates/times nodes in active version");

  const sessionsRepo = createSupabaseConversationSessionRepository(client);
  const runsRepo = createSupabaseAutomationRunRepository(client);
  const resolveActor = (cid: string) => resolveCompanyActorUserId(client, cid);
  const lookupOptions = createLookupOptionsPort(client);

  const automationServices = createAutomationPlatformServices(client, {
    actionDeps: {
      customerService: createSupabaseCustomerServicePort(client, {
        resolveActorUserIdForCompany: resolveActor,
      }),
      bookingService: createSupabaseBookingServicePort(client, {
        resolveActorUserIdForCompany: resolveActor,
      }),
      conversationCustomerLink: createSupabaseConversationCustomerLinkPort(client),
      lookupOptions,
      businessCalendar: createBusinessCalendarPort(),
    },
  });

  await abandonAllActiveExecutionsForUser(
    automationServices.engine,
    ctx as never,
    { sessions: sessionsRepo, runs: runsRepo },
    { companyId, channel: "whatsapp", externalUserId: WA_USER, boundFlowId: FLOW_ID, reason: "trace_clean_slate" },
  );

  // Run flow through doctor selection using engine.start/resume (minimal inline replay)
  const { createChannelPlatformServices } = await import("../lib/channel-platform/src/index.ts");
  const { createConversationServices } = await import("../lib/ai-conversation/src/index.ts");
  const { createChannelRegistryServices } = await import("../lib/channel-registry/src/index.ts");
  const { createChannelPlatformPortsWithContext } = await import(
    "../artifacts/login-app/src/lib/channel-platform/platform-ports.ts"
  );
  const { createChannelAutomationPortFromClient } = await import(
    "../artifacts/api-server/src/platform/channel-automation-port.ts"
  );
  const { ChannelWorkflowResolver } = await import("../lib/channel-platform/src/services/channel-workflow-resolver.ts");
  const { createSupabaseChannelWorkflowBindingRepository } = await import(
    "../lib/channel-platform/src/repositories/supabase-channel-workflow-binding-repository.ts"
  );
  const { createChannelWorkflowFlowValidator } = await import(
    "../artifacts/api-server/src/platform/channel-automation-port.ts"
  );

  const { data: channel } = await client.from("company_channels").select("*").eq("id", CHANNEL_ID).single();
  const phoneNumberId = String(channel!.configuration?.phoneNumberId ?? "");
  const { data: assistantRow } = await client
    .from("ai_assistant_settings")
    .select("id")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();

  const conversationServices = createConversationServices(client);
  const channelRegistryServices = createChannelRegistryServices(client);
  const channelPorts = createChannelPlatformPortsWithContext(
    { channelRegistry: channelRegistryServices, conversation: conversationServices },
    { registry: ctx, conversation: ctx },
  );
  channelPorts.automation = createChannelAutomationPortFromClient(
    automationServices.engine,
    ctx as never,
    client,
  );

  const channelPlatform = createChannelPlatformServices(client, {
    ports: channelPorts,
    whatsAppFetchFn: async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ messaging_product: "whatsapp", messages: [{ id: `wamid.trace.${randomUUID()}` }] }),
      }) as Response,
    workflowResolver: new ChannelWorkflowResolver({
      bindings: createSupabaseChannelWorkflowBindingRepository(client),
      flowValidator: createChannelWorkflowFlowValidator(client),
    }),
  });

  function waList(replyId: string, title: string) {
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
                contacts: [{ profile: { name: "Trace" }, wa_id: WA_USER }],
                messages: [
                  {
                    from: WA_USER,
                    id: `wamid.${randomUUID()}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "interactive",
                    interactive: { type: "list_reply", list_reply: { id: replyId, title } },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  function waText(body: string) {
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
                contacts: [{ profile: { name: "Trace" }, wa_id: WA_USER }],
                messages: [
                  {
                    from: WA_USER,
                    id: `wamid.${randomUUID()}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  async function route(step: string, payload: unknown) {
    const result = await channelPlatform.router.routeWebhook(ctx as never, {
      companyId,
      companyChannelId: CHANNEL_ID,
      channelKey: "whatsapp",
      rawPayload: payload,
      executeAi: false,
      aiAssistantId: assistantRow!.id,
    });
    const runId =
      result.kind === "inbound" ? (result.result?.automationRunId as string | undefined) : undefined;
    const { data: run } = runId
      ? await client.from("automation_runs").select("*").eq("id", runId).maybeSingle()
      : { data: null };
    printStep({
      step,
      executionMode: "channel_router",
      runId: run?.id ?? runId ?? null,
      sessionId: run?.session_id ?? null,
      currentNodeId: run?.current_node_id ?? null,
      nodeAction: run?.current_node_id
        ? ((nodes ?? []).find((n) => n.id === run!.current_node_id)?.config?.action ?? null)
        : null,
      runStatus: run?.status ?? null,
      selected_date: run?.variables?.selected_date ?? null,
      selected_resource: run?.variables?.selected_resource ?? null,
      selected_service: run?.variables?.selected_service ?? null,
      outboundQueueLength: Array.isArray(run?.variables?.__outboundQueue)
        ? run!.variables.__outboundQueue.length
        : 0,
      error: run?.error_message ?? null,
    });
    return run;
  }

  // Fast-forward to dates list
  await route("Hello", waText("Hello"));
  await route("Book", {
    ...waList("book", "Book Appointment"),
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              ...waList("book", "Book Appointment").entry[0].changes[0].value,
              messages: [
                {
                  from: WA_USER,
                  id: `wamid.${randomUUID()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "interactive",
                  interactive: { type: "button_reply", button_reply: { id: "book", title: "Book Appointment" } },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  await route("Phone", waText("01011404109"));

  let run = await route("Service", waList("a8a6403e-4c88-48ae-aa46-d204ea8ef49d", "عيادة"));
  run = await route("Doctor", waList("1c766372-7726-4cb6-b660-b88ae85fb49c", "ADAM"));

  const variablesBeforeDate = (run!.variables ?? {}) as Record<string, unknown>;
  const runId = run!.id as string;
  const sessionId = run!.session_id as string;

  // --- STEP 1: Build dates list sections (state before date selection) ---
  const dateSections = await resolveListNodeSections(
    datesNode as never,
    companyId,
    lookupOptions,
    variablesBeforeDate,
    { runId, sessionId },
  );
  const dateRow = dateSections[0]?.rows?.[0];
  if (!dateRow) throw new Error("No date rows available for trace");

  printStep({
    step: "1_available_dates_list_built",
    currentNodeId: datesNode.id,
    nodeAction: "send_list",
    executionMode: "pre_date_selection",
    runId,
    sessionId,
    selected_date: variablesBeforeDate.selected_date ?? null,
    selected_resource: variablesBeforeDate.selected_resource ?? null,
    selected_service: variablesBeforeDate.selected_service ?? null,
    generatedListRows: dateSections[0]?.rows?.slice(0, 3) ?? [],
    nodeResult: { outcome: "waiting_input", rowCount: dateSections[0]?.rows?.length ?? 0 },
  });

  // --- STEP 2: Simulate date selection (built-in-nodes executeInteractiveMessageAction selection branch) ---
  const dateReplyId = dateRow.id;
  const selectionInput = {
    kind: "interactive_reply",
    replyId: dateReplyId,
    title: dateRow.title,
    interactionType: "list_reply",
  };
  const selection = extractInteractiveSelection(selectionInput as never, { fallbackHint: "send_list" });

  let listConfig = datesNode.config as Record<string, unknown>;
  if (isListLookupMode(listConfig)) {
    const sections = await resolveListNodeSections(
      datesNode as never,
      companyId,
      lookupOptions,
      variablesBeforeDate,
      { runId, sessionId },
    );
    if (sections.length > 0) listConfig = { ...listConfig, sections };
  }

  const outputVariable = readInteractiveListOutputVariable(listConfig);
  const storedRecord = resolveInteractiveListStoredRecord(listConfig, dateReplyId);
  const selectionPatch: Record<string, unknown> = {};
  if (storedRecord && outputVariable) {
    selectionPatch[outputVariable] = storedRecord;
  }

  const variablesAfterDateSelection = mergeVariables(variablesBeforeDate, {
    ...mergeConversationVariables(variablesBeforeDate, selection!),
    ...selectionPatch,
    [INTERACTIVE_SELECTION_INPUT_KEY]: selection!.last_button_id ?? null,
    __waitingFor: null,
    __prompt: null,
    ...clearLatestOutboundSlot(),
  });

  printStep({
    step: "2_date_selection_persisted",
    currentNodeId: datesNode.id,
    nodeAction: "send_list",
    executionMode: "resume_selection",
    runId,
    sessionId,
    selected_date: variablesAfterDateSelection.selected_date ?? null,
    selected_resource: variablesAfterDateSelection.selected_resource ?? null,
    selected_service: variablesAfterDateSelection.selected_service ?? null,
    lookupFiltersRaw: readListLookupRuntimeConfig(timesNode.config as Record<string, unknown>).filters,
    nodeResult: {
      outcome: "continue",
      outputVariable,
      storedRecord,
      replyId: dateReplyId,
    },
    verification: {
      selected_date_stored: variablesAfterDateSelection.selected_date != null,
      selected_date_is_iso:
        typeof (variablesAfterDateSelection.selected_date as { date?: string } | null)?.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test((variablesAfterDateSelection.selected_date as { date: string }).date),
    },
  });

  // --- STEP 3: Lookup filter resolution for available_slots ---
  const timesLookupConfig = readListLookupRuntimeConfig(timesNode.config as Record<string, unknown>);
  const resolvedFilters = resolveLookupFilterValues(timesLookupConfig.filters, variablesAfterDateSelection);
  const resolvedFiltersDotDate = resolveLookupFilterValues(
    { ...timesLookupConfig.filters, date: "{{selected_date.date}}" },
    variablesAfterDateSelection,
  );

  printStep({
    step: "3_lookup_filter_resolution",
    currentNodeId: timesNode.id,
    nodeAction: "send_list",
    executionMode: "executeFromNode",
    runId,
    sessionId,
    selected_date: variablesAfterDateSelection.selected_date,
    selected_resource: variablesAfterDateSelection.selected_resource,
    selected_service: variablesAfterDateSelection.selected_service,
    lookupFiltersAfterInterpolation: resolvedFilters,
    lookupFiltersSelectedDateDotDate: resolvedFiltersDotDate,
    verification: {
      resolves_selected_date: resolvedFilters.date === (variablesAfterDateSelection.selected_date as { date: string }).date,
      resolves_selected_date_dot_date: resolvedFiltersDotDate.date === (variablesAfterDateSelection.selected_date as { date: string }).date,
    },
  });

  // --- STEP 4: available_slots lookup + slot generation ---
  let slotRows: Awaited<ReturnType<typeof lookupOptions.fetchListOptions>> = [];
  let slotLookupError: ReturnType<typeof formatError> | null = null;
  try {
    slotRows = await lookupOptions.fetchListOptions(companyId, {
      ...timesLookupConfig,
      filters: resolvedFilters,
    });
  } catch (error) {
    slotLookupError = formatError(error);
  }

  printStep({
    step: "4_available_slots_lookup",
    currentNodeId: timesNode.id,
    nodeAction: "send_list",
    executionMode: "lookupOptionsPort.fetchListOptions",
    runId,
    sessionId,
    selected_date: variablesAfterDateSelection.selected_date,
    lookupFiltersAfterInterpolation: resolvedFilters,
    sqlOrServiceQuery: {
      type: "scheduling.slotGenerationEngine.getAvailableSlots",
      params: {
        companyId,
        resource_id: resolvedFilters.resource_id,
        service_id: resolvedFilters.service_id,
        date: resolvedFilters.date,
        options: { respectBookingRules: true },
      },
      supabaseFollowUp: "scheduling_resources.select(branch_id).eq(id=resource_id)",
    },
    rowsReturned: slotRows.length,
    generatedListRows: slotRows.slice(0, 5),
    ...(slotLookupError ? { failure: slotLookupError } : {}),
    verification: { available_slots_returns_rows: slotRows.length > 0 },
  });

  // --- STEP 5: resolveListNodeSections (send_list path) ---
  let timeSections: Awaited<ReturnType<typeof resolveListNodeSections>> = [];
  let listSectionsError: ReturnType<typeof formatError> | null = null;
  try {
    timeSections = await resolveListNodeSections(
      timesNode as never,
      companyId,
      lookupOptions,
      variablesAfterDateSelection,
      { runId, sessionId },
    );
  } catch (error) {
    listSectionsError = formatError(error);
  }

  printStep({
    step: "5_send_list_resolve_sections",
    currentNodeId: timesNode.id,
    nodeAction: "send_list",
    executionMode: "built-in-nodes.executeInteractiveMessageAction",
    runId,
    sessionId,
    generatedListRows: timeSections[0]?.rows?.slice(0, 5) ?? [],
    nodeResult: listSectionsError
      ? { outcome: "failed", error: listSectionsError.message }
      : { outcome: "waiting_input", rowCount: timeSections[0]?.rows?.length ?? 0 },
    ...(listSectionsError ? { failure: listSectionsError } : {}),
    verification: { send_list_executes: !listSectionsError && (timeSections[0]?.rows?.length ?? 0) > 0 },
  });

  // --- STEP 6: Build outbound payload ---
  let outboundPayload: unknown = null;
  let outboundError: ReturnType<typeof formatError> | null = null;
  try {
    if (timeSections.length === 0) {
      throw new Error(
        `send_list node ${timesNode.id} did not produce outbound payload (lookup=available_slots).`,
      );
    }
    const menuNode = {
      ...timesNode,
      config: { ...timesNode.config, sections: timeSections },
    };
    const { outbound } = buildInteractiveMenuOutbound(menuNode as never);
    outboundPayload = outbound;
  } catch (error) {
    outboundError = formatError(error);
  }

  printStep({
    step: "6_whatsapp_outbound_payload",
    currentNodeId: timesNode.id,
    nodeAction: "send_list",
    executionMode: "buildInteractiveMenuOutbound",
    runId,
    sessionId,
    outboundPayload,
    ...(outboundError ? { failure: outboundError } : {}),
    verification: { whatsapp_payload_generated: outboundPayload != null },
  });

  // --- STEP 7: Live channel router date selection + dispatch extraction ---
  let liveRouteError: ReturnType<typeof formatError> | null = null;
  let dispatchMessages: ReturnType<typeof extractAutomationOutboundMessages> = [];
  try {
    const liveResult = await channelPlatform.router.routeWebhook(ctx as never, {
      companyId,
      companyChannelId: CHANNEL_ID,
      channelKey: "whatsapp",
      rawPayload: waList(dateReplyId, dateRow.title),
      executeAi: false,
      aiAssistantId: assistantRow!.id,
    });
    if (liveResult.kind === "inbound" && liveResult.result) {
      const automationResult = {
        lifecycle: String(liveResult.result.lifecycle ?? "unknown"),
        variables:
          ((await client
            .from("automation_runs")
            .select("variables")
            .eq("id", liveResult.result.automationRunId as string)
            .maybeSingle()).data?.variables as Record<string, unknown>) ?? {},
      };
      dispatchMessages = extractAutomationOutboundMessages(automationResult);
      printStep({
        step: "7_live_channel_router_date_selection",
        executionMode: "resume",
        runId: liveResult.result.automationRunId ?? null,
        currentNodeId: automationResult.variables ? null : null,
        nodeAction: "send_list",
        selected_date: automationResult.variables.selected_date ?? null,
        outboundPayload: dispatchMessages.map((m) => m.payload),
        nodeResult: { lifecycle: automationResult.lifecycle },
        verification: {
          outbound_dispatcher_called: dispatchMessages.length > 0,
          outbound_is_times_list:
            dispatchMessages.some((m) => m.payload?.kind === "list" && m.payload?.title === "Choose suitable time"),
        },
      });
    }
  } catch (error) {
    liveRouteError = formatError(error);
    printStep({ step: "7_live_channel_router_date_selection", failure: liveRouteError });
  }

  // --- Simulate OLD bug (pre normalizeLookupFilterValue fix) ---
  const badDateFilter = String(variablesAfterDateSelection.selected_date);
  printStep({
    step: "REGRESSION_pre_fix_simulation",
    note: "Without normalizeLookupFilterValue object→date extraction, filter date becomes:",
    badDateValue: badDateFilter,
    wouldBreakSlotGeneration: badDateFilter === "[object Object]",
  });

  if (listSectionsError) {
    console.error("\n=== EXECUTION STOPPED ===");
    console.error(JSON.stringify(listSectionsError, null, 2));
    process.exit(1);
  }
}

main().catch((error) => {
  const failure = formatError(error);
  console.error(JSON.stringify({ trace: "date_to_times_fatal", failure }, null, 2));
  process.exit(1);
});
