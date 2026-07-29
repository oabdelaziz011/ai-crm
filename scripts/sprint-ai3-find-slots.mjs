/**
 * Find first bookable slot via search_availability (live).
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

const env = {};
for (const f of [resolve(root, ".env")]) {
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
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
    input: { serviceId: service?.id, resourceId: mapping?.resource_id, daysAhead: 60 },
    triggeredBy: "llm",
  },
);

const slots =
  searchResult.output?.resources?.flatMap((r) =>
    (r.slots ?? []).map((s) => ({ ...s, resourceId: r.resourceId, resourceName: r.resourceName })),
  ) ?? [];

console.log(
  JSON.stringify(
    {
      service,
      resourceId: mapping?.resource_id,
      slotCount: slots.length,
      firstSlot: slots[0] ?? null,
      availableDates: searchResult.output?.availableDates,
      executionId: searchResult.executionId,
    },
    null,
    2,
  ),
);
