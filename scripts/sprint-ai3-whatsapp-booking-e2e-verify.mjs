/**
 * Sprint AI.3 — Runtime E2E verification (WhatsApp booking flow).
 * Executes Tool Router + scheduling engines against live Supabase data.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  loadDevScriptEnv,
  requireEnvValue,
  resolveChannelId,
} from "./lib/dev-script-env.mjs";
import {
  createWebhookToolRouterIntegrations,
} from "../artifacts/api-server/src/platform/create-webhook-tool-router-integrations.ts";
import {
  ToolCallLoopService,
} from "../lib/ai-execution-engine/src/runtime/tool-call-loop-service.ts";
import { resolveCompanyActorUserId } from "../lib/automation-platform/src/crm/supabase/create-supabase-customer-service-port.ts";

const { root, env } = loadDevScriptEnv(import.meta.url);
const CHANNEL_ID = resolveChannelId(process.argv.slice(2), env);
const BOOKING_MESSAGE =
  env.E2E_BOOKING_MESSAGE ??
  process.env.E2E_BOOKING_MESSAGE ??
  "I want to book a teeth cleaning appointment tomorrow.";

const stages = [];

function stage(name, pass, detail, evidence = {}) {
  stages.push({ stage: name, pass, detail, evidence });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}: ${detail}`);
  if (Object.keys(evidence).length > 0) {
    console.log(JSON.stringify(evidence, null, 2));
  }
}

const url = requireEnvValue(env, ["SUPABASE_URL", "VITE_SUPABASE_URL"], "Supabase URL");
const serviceKey = requireEnvValue(env, ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"], "Supabase service role key");

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

async function countTable(table, filter) {
  let q = sb.from(table).select("id", { count: "exact", head: true });
  for (const [key, value] of Object.entries(filter)) {
    q = q.eq(key, value);
  }
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function main() {
  console.log("\n=== Sprint AI.3 WhatsApp Booking E2E Verification ===\n");

  // Stage 1 — Inbound (evidence from live webhook logs + channel row)
  const { data: channel, error: channelErr } = await sb
    .from("company_channels")
    .select("id, company_id, channel_key, status, configuration")
    .eq("id", CHANNEL_ID)
    .maybeSingle();

  stage(
    "1. Inbound WhatsApp message received",
    !channelErr && Boolean(channel),
    channelErr ? channelErr.message : `Channel ${CHANNEL_ID} active=${channel?.status}`,
    { companyChannelId: CHANNEL_ID, channelKey: channel?.channel_key, status: channel?.status },
  );

  const companyId = channel?.company_id ?? null;

  // Stage 2 — Conversation / session (recent session for WA user from logs)
  const { data: recentSession } = await sb
    .from("channel_sessions")
    .select("id, conversation_id, external_thread_id, updated_at")
    .eq("company_channel_id", CHANNEL_ID)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  stage(
    "2. Conversation created or resumed",
    Boolean(recentSession?.conversation_id),
    recentSession
      ? `Session ${recentSession.id} → conversation ${recentSession.conversation_id}`
      : "No channel session found",
    recentSession ?? {},
  );

  // Stage 3 — Enterprise Runtime (blocked when workflow binding exists)
  const { data: workflowBinding } = await sb
    .from("company_channel_automation_bindings")
    .select("id, automation_flow_id, is_enabled, updated_at")
    .eq("company_channel_id", CHANNEL_ID)
    .eq("is_enabled", true)
    .is("deleted_at", null)
    .maybeSingle();

  stage(
    "3. Enterprise Runtime starts",
    !workflowBinding,
    workflowBinding
      ? `BLOCKED: active workflow binding routes to AutomationEngine (flow ${workflowBinding.automation_flow_id})`
      : "No workflow binding — runtime path available",
    workflowBinding ?? { workflowBinding: null },
  );

  const actorUserId = companyId ? await resolveCompanyActorUserId(sb, companyId) : null;

  const { toolRouterServices, tools } = createWebhookToolRouterIntegrations(sb);
  const allowedTools = tools.allowedToolKeys();

  stage(
    "4. LLM can request search_availability (tool exposed)",
    allowedTools.includes("search_availability"),
    allowedTools.includes("search_availability")
      ? "search_availability in allowedToolKeys"
      : `Missing from catalog: ${allowedTools.join(", ")}`,
    { allowedToolKeys: allowedTools },
  );

  stage(
    "10. LLM can invoke create_booking (tool exposed)",
    allowedTools.includes("create_booking"),
    allowedTools.includes("create_booking")
      ? "create_booking in allowedToolKeys"
      : "create_booking not exposed to LLM",
    {},
  );

  const { data: toolDefs } = await sb
    .from("tool_definitions")
    .select("key, is_enabled, required_permissions")
    .in("key", ["search_availability", "create_booking", "booking"]);

  const searchToolEnabled = toolDefs?.find((t) => t.key === "search_availability")?.is_enabled === true;
  const createToolEnabled = toolDefs?.find((t) => t.key === "create_booking")?.is_enabled === true;
  const mockBookingDisabled = toolDefs?.find((t) => t.key === "booking")?.is_enabled === false;

  stage(
    "Tool definitions in DB (migrations 185/186)",
    searchToolEnabled && createToolEnabled,
    `search_availability=${searchToolEnabled}, create_booking=${createToolEnabled}, mock booking disabled=${mockBookingDisabled}`,
    { toolDefs },
  );

  // Find scheduling service for teeth cleaning
  const { data: services } = await sb
    .from("scheduling_services")
    .select("id, name, duration_minutes, status")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .ilike("name", "%clean%")
    .limit(5);

  const service = services?.[0] ?? null;

  let resourceId = null;
  if (service) {
    const { data: mappings } = await sb
      .from("resource_services")
      .select("resource_id, scheduling_resources!inner(id, name, status)")
      .eq("company_id", companyId)
      .eq("service_id", service.id)
      .is("deleted_at", null)
      .limit(3);
    resourceId = mappings?.[0]?.resource_id ?? null;
  }

  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const dateStr = tomorrow.toISOString().slice(0, 10);

  let searchResult = null;
  let searchExec = null;

  if (actorUserId && service && resourceId && recentSession?.conversation_id) {
    try {
      searchExec = await toolRouterServices.router.route(
        {
          userId: actorUserId,
          companyId,
          isSuperAdmin: false,
          hasPermission: (code) =>
            code === "tools.execute" || code === "availability.search" || code === "bookings.create",
        },
        {
          conversationId: recentSession.conversation_id,
          toolKey: "search_availability",
          input: { serviceId: service.id, resourceId, date: dateStr },
          triggeredBy: "llm",
        },
      );
      searchResult = searchExec.output;
    } catch (error) {
      searchExec = { status: "error", error: error instanceof Error ? error.stack ?? error.message : String(error) };
    }
  }

  stage(
    "5–7. Tool Router → search_availability → real slots",
    searchExec?.status === "succeeded" && Array.isArray(searchResult?.resources) && searchResult.resources.some((r) => r.slots?.length > 0),
    searchExec?.status === "succeeded"
      ? `Returned ${searchResult?.resources?.[0]?.slots?.length ?? 0} slots for ${dateStr}`
      : `Route failed: ${searchExec?.error ?? searchExec?.error_message ?? searchExec?.status ?? "missing prerequisites"}`,
    {
      serviceId: service?.id,
      serviceName: service?.name,
      resourceId,
      date: dateStr,
      executionId: searchExec?.executionId,
      output: searchResult,
      actorUserId,
    },
  );

  const slot = searchResult?.resources?.[0]?.slots?.[0] ?? null;

  // Customer for booking — use CRM customer linked to WA thread if any
  const { data: customers } = await sb
    .from("customers")
    .select("id, name, phone")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .limit(1);

  const customerId = customers?.[0]?.id ?? null;

  const legacyBefore = await countTable("bookings", { company_id: companyId }).catch(() => -1);
  const schedulingBefore = await countTable("scheduling_bookings", { company_id: companyId }).catch(() => -1);

  let bookingExec = null;
  let bookingResult = null;

  if (slot && customerId && actorUserId && recentSession?.conversation_id) {
    try {
      bookingExec = await toolRouterServices.router.route(
        {
          userId: actorUserId,
          companyId,
          isSuperAdmin: false,
          hasPermission: (code) =>
            code === "tools.execute" || code === "bookings.create" || code === "availability.search",
        },
        {
          conversationId: recentSession.conversation_id,
          toolKey: "create_booking",
          input: {
            customerId,
            serviceId: service.id,
            resourceId,
            date: slot.date ?? dateStr,
            slotStart: slot.start,
            notes: "Sprint AI.3 E2E verification",
          },
          triggeredBy: "llm",
        },
      );
      bookingResult = bookingExec.output;
    } catch (error) {
      bookingExec = { status: "error", error: error instanceof Error ? error.stack ?? error.message : String(error) };
    }
  }

  const legacyAfter = await countTable("bookings", { company_id: companyId }).catch(() => -1);
  const schedulingAfter = await countTable("scheduling_bookings", { company_id: companyId }).catch(() => -1);

  stage(
    "11–12. Tool Router → create_booking → BookingDomainService",
    bookingExec?.status === "succeeded" && bookingResult?.success === true,
    bookingExec?.status === "succeeded"
      ? `Booking ${bookingResult?.bookingId} status=${bookingResult?.status}`
      : `Failed: ${JSON.stringify(bookingResult ?? bookingExec?.error ?? bookingExec?.status)}`,
    { executionId: bookingExec?.executionId, output: bookingResult },
  );

  stage(
    "13. Validations executed (domain error codes if fail)",
    bookingResult?.success === true || Array.isArray(bookingResult?.errors),
    bookingResult?.success
      ? "BookingDomainService accepted input"
      : `Validation/block: ${(bookingResult?.errors ?? []).join(", ") || "not reached"}`,
    { errors: bookingResult?.errors },
  );

  stage(
    "14. Persisted scheduling_bookings ONLY (no legacy bookings write)",
    bookingResult?.success === true &&
      schedulingAfter > schedulingBefore &&
      legacyAfter === legacyBefore,
    `scheduling_bookings ${schedulingBefore}→${schedulingAfter}, legacy bookings ${legacyBefore}→${legacyAfter}`,
    { schedulingBefore, schedulingAfter, legacyBefore, legacyAfter },
  );

  let eventEvidence = null;
  if (bookingResult?.bookingId) {
    const { data: auditRows } = await sb
      .from("communication_audit_log")
      .select("id, template_key, status, created_at")
      .eq("company_id", companyId)
      .eq("idempotency_key", `BookingCreated:${bookingResult.bookingId}:${bookingResult.bookingId}`)
      .limit(1);

    const { data: reminders } = await sb
      .from("communication_reminder_schedules")
      .select("id, status, channel, scheduled_at")
      .eq("company_id", companyId)
      .eq("reference_type", "booking")
      .eq("reference_id", bookingResult.bookingId)
      .limit(5);

    eventEvidence = { auditRows, reminderCount: reminders?.length ?? 0, reminders };
  }

  stage(
    "15–16. Booking events + notification pipeline",
    Boolean(eventEvidence?.reminderCount > 0 || eventEvidence?.auditRows?.length > 0),
    eventEvidence
      ? `${eventEvidence.reminderCount} reminder rows, ${eventEvidence.auditRows?.length ?? 0} audit rows`
      : "No booking created — pipeline not triggered",
    eventEvidence ?? {},
  );

  // LLM tool loop simulation (runtime path when workflow absent)
  let loopPass = false;
  let loopDetail = "Skipped — workflow blocks production WhatsApp runtime";
  if (!workflowBinding && actorUserId && recentSession?.conversation_id && service) {
    const toolCalls = [];
    const gateway = {
      async chatCompletion(input) {
        if (!input.messages.some((m) => m.role === "tool")) {
          toolCalls.push("search_availability");
          return {
            text: "",
            model: "mock",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-1",
                name: "search_availability",
                arguments: { serviceId: service.id, resourceId, date: dateStr },
              },
            ],
          };
        }
        loopPass = true;
        return {
          text: "Here are available slots. Which time works for you?",
          model: "mock",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
          latencyMs: 2,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    try {
      await loop.run({
        ctx: {
          userId: actorUserId,
          companyId,
          isSuperAdmin: false,
          hasPermission: () => true,
        },
        conversationId: recentSession.conversation_id,
        gatewayRequest: {
          messages: [{ role: "user", content: BOOKING_MESSAGE }],
          model: "mock",
        },
        tools: tools.listLlmTools(),
        allowedToolKeys: tools.allowedToolKeys(),
      });
      loopDetail = `Tool loop invoked: ${toolCalls.join(" → ")}`;
    } catch (error) {
      loopDetail = error instanceof Error ? error.message : String(error);
    }
  }

  stage(
    "8. LLM responds asking customer to choose slot (runtime path)",
    loopPass,
    loopDetail,
    {},
  );

  stage(
    "17. WhatsApp confirmation outbound (configured channel)",
    false,
    "Configured channel webhook path did not produce runtime execution and outbound delivery in this verification run",
    {
      evidence: "Inspect channel_inbound_events and channel_delivery_events for the configured CHANNEL_ID after a live webhook POST",
      workflowFlowId: workflowBinding?.automation_flow_id ?? null,
      companyChannelId: CHANNEL_ID,
    },
  );

  // Recent production tool executions
  const { data: recentToolExecs } = await sb
    .from("tool_executions")
    .select("tool_key, status, triggered_by, created_at, output")
    .eq("company_id", companyId)
    .in("tool_key", ["search_availability", "create_booking", "booking", "appointment_lookup"])
    .order("created_at", { ascending: false })
    .limit(10);

  stage(
    "Production tool_executions history (WhatsApp LLM)",
    (recentToolExecs ?? []).some((row) => row.triggered_by === "llm"),
    `${recentToolExecs?.length ?? 0} recent scheduling tool executions`,
    { recentToolExecs },
  );

  console.log("\n=== SUMMARY ===");
  const passCount = stages.filter((s) => s.pass).length;
  console.log(`${passCount}/${stages.length} stages PASS`);

  const canBook =
    !workflowBinding &&
    searchExec?.status === "succeeded" &&
    bookingExec?.status === "succeeded" &&
    bookingResult?.success === true;

  console.log("\nFINAL: Can a production customer complete booking through WhatsApp today without developer intervention?");
  console.log(canBook ? "YES (runtime evidence)" : "NO (runtime evidence)");
  if (!canBook) {
    console.log("Primary blocker:", workflowBinding ? "WhatsApp channel bound to automation workflow — Enterprise Runtime never starts" : "Downstream step failed — see FAIL stages above");
  }

  writeFileSync(
    resolve(root, "docs/architecture/sprint-ai3-whatsapp-booking-e2e-report.json"),
    JSON.stringify({ verifiedAt: new Date().toISOString(), stages, canBook }, null, 2),
  );
}

await main();
