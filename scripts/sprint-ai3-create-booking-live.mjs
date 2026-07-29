/**
 * Live create_booking after search_availability on an open day.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createWebhookToolRouterIntegrations } from "../artifacts/api-server/src/platform/create-webhook-tool-router-integrations.ts";
import { resolveCompanyActorUserId } from "../lib/automation-platform/src/crm/supabase/create-supabase-customer-service-port.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const CONVERSATION_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";
const SEARCH_DATE = process.argv[2] ?? "2026-08-04"; // Monday

const env = {};
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const actorUserId = await resolveCompanyActorUserId(sb, COMPANY_ID);

const { data: service } = await sb
  .from("scheduling_services")
  .select("id, name")
  .eq("company_id", COMPANY_ID)
  .eq("status", "active")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();

const { data: mapping } = await sb
  .from("resource_services")
  .select("resource_id")
  .eq("company_id", COMPANY_ID)
  .eq("service_id", service?.id)
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();

const { data: customer } = await sb
  .from("customers")
  .select("id, name, phone")
  .eq("company_id", COMPANY_ID)
  .limit(1)
  .maybeSingle();

const { count: schedulingBefore } = await sb
  .from("scheduling_bookings")
  .select("id", { count: "exact", head: true })
  .eq("company_id", COMPANY_ID);

const { toolRouterServices } = createWebhookToolRouterIntegrations(sb);

const searchResult = await toolRouterServices.router.route(
  {
    userId: actorUserId,
    companyId: COMPANY_ID,
    isSuperAdmin: false,
    hasPermission: () => true,
  },
  {
    conversationId: CONVERSATION_ID,
    toolKey: "search_availability",
    input: { serviceId: service?.id, resourceId: mapping?.resource_id, date: SEARCH_DATE },
    triggeredBy: "llm",
  },
);

const slot = searchResult.output?.resources?.[0]?.slots?.[0] ?? null;

let bookingResult = null;
if (slot && customer) {
  bookingResult = await toolRouterServices.router.route(
    {
      userId: actorUserId,
      companyId: COMPANY_ID,
      isSuperAdmin: false,
      hasPermission: () => true,
    },
    {
      conversationId: CONVERSATION_ID,
      toolKey: "create_booking",
      input: {
        customerId: customer.id,
        serviceId: service.id,
        resourceId: mapping.resource_id,
        date: slot.date ?? SEARCH_DATE,
        slotStart: slot.start,
        notes: "Sprint AI.3 production readiness verification",
      },
      triggeredBy: "llm",
    },
  );
}

const { count: schedulingAfter } = await sb
  .from("scheduling_bookings")
  .select("id", { count: "exact", head: true })
  .eq("company_id", COMPANY_ID);

let reminders = [];
if (bookingResult?.output?.bookingId) {
  const { data } = await sb
    .from("communication_reminder_schedules")
    .select("id, status, channel")
    .eq("company_id", COMPANY_ID)
    .eq("reference_type", "booking")
    .eq("reference_id", bookingResult.output.bookingId);
  reminders = data ?? [];
}

console.log(
  JSON.stringify(
    {
      searchDate: SEARCH_DATE,
      searchStatus: searchResult.status,
      slot,
      bookingStatus: bookingResult?.status,
      bookingOutput: bookingResult?.output,
      schedulingBookings: `${schedulingBefore} → ${schedulingAfter}`,
      reminders,
    },
    null,
    2,
  ),
);
