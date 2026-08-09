import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const env: Record<string, string> = {};
for (const line of readFileSync(resolve(projectRoot, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const companyId = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const leadId = "49011234-9380-4109-b17c-b89e279d41a9";

const { data: company } = await sb
  .from("companies")
  .select("id, name, default_currency, settings")
  .eq("id", companyId)
  .maybeSingle();
console.log("companies:", company);

const { data: billingRows } = await sb
  .from("platform_billing_settings")
  .select("*")
  .eq("company_id", companyId);
console.log("platform_billing_settings:", billingRows);

const { data: lead } = await sb
  .from("leads")
  .select("id, title, currency, estimated_value, created_at, customer_id, lifecycle_status")
  .eq("id", leadId)
  .maybeSingle();
console.log("lead:", lead);

// Simulate resolveLeadOpportunityCurrency at creation time
const { resolveLeadOpportunityCurrency } = await import(
  "../../../lib/opportunity-platform/src/currency-utils.ts"
);
const companyDefault = company?.default_currency ? String(company.default_currency) : "EGP";
console.log("resolveLeadOpportunityCurrency simulation:", {
  leadCurrency: lead?.currency,
  companyDefault,
  resolved: resolveLeadOpportunityCurrency(lead?.currency, companyDefault),
});
