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
for (const f of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
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

const tomorrow = new Date();
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
const dateStr = tomorrow.toISOString().slice(0, 10);

const { toolRouterServices } = createWebhookToolRouterIntegrations(sb);

let searchResult;
try {
  searchResult = await toolRouterServices.router.route(
    {
      userId: actorUserId,
      companyId: COMPANY_ID,
      isSuperAdmin: false,
      hasPermission: (code) => code === "tools.execute" || code === "availability.search",
    },
    {
      conversationId: CONVERSATION_ID,
      toolKey: "search_availability",
      input: { serviceId: service?.id, resourceId: mapping?.resource_id, date: dateStr },
      triggeredBy: "llm",
    },
  );
} catch (error) {
  searchResult = { error: error instanceof Error ? error.stack : String(error) };
}

const { data: execRow } = await sb
  .from("tool_executions")
  .select("id, tool_key, status, input, output, error_message")
  .eq("id", searchResult?.executionId ?? "none")
  .maybeSingle();

console.log(JSON.stringify({
  actorUserId,
  service,
  resourceId: mapping?.resource_id,
  dateStr,
  searchResult,
  persistedExecution: execRow,
}, null, 2));
