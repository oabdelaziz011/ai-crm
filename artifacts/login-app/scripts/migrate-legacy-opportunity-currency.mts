/**
 * One-time migration: fix legacy lead-linked opportunities that still have USD
 * when the company default billing currency is EGP (or another non-USD default).
 *
 * Run:
 *   npx tsx artifacts/login-app/scripts/migrate-legacy-opportunity-currency.mts
 *
 * Optional dry-run (no writes):
 *   npx tsx artifacts/login-app/scripts/migrate-legacy-opportunity-currency.mts --dry-run
 *
 * Scope:
 *   - opportunities.created_from_lead = true
 *   - opportunities.currency = 'USD'
 *   - linked lead exists with currency = 'USD' (legacy default)
 *   - company billing default_currency != 'USD'
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dryRun = process.argv.includes("--dry-run");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const env: Record<string, string> = {};
for (const p of [resolve(projectRoot, ".env"), resolve(projectRoot, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const defaultByCompany = new Map<string, string>();

async function resolveCompanyDefault(companyId: string): Promise<string> {
  if (defaultByCompany.has(companyId)) return defaultByCompany.get(companyId)!;

  const { data: viewRow } = await sb
    .from("company_billing_settings")
    .select("default_currency")
    .eq("company_id", companyId)
    .maybeSingle();
  if (viewRow?.default_currency) {
    const currency = String(viewRow.default_currency).trim() || "USD";
    defaultByCompany.set(companyId, currency);
    return currency;
  }

  const { data, error } = await sb.rpc("resolve_billing_setting_value", {
    p_code: "default_currency",
    p_company_id: companyId,
  });
  if (error) return "USD";
  const raw = typeof data === "string" ? data : JSON.stringify(data);
  const currency = raw.replace(/^"|"$/g, "").trim() || "USD";
  defaultByCompany.set(companyId, currency);
  return currency;
}

const { data: candidates, error: listErr } = await sb
  .from("opportunities")
  .select("id, name, company_id, currency, lead_id, created_from_lead")
  .eq("created_from_lead", true)
  .eq("currency", "USD")
  .is("deleted_at", null);

if (listErr) {
  console.error("Failed to list opportunities", listErr);
  process.exit(1);
}

const toUpdate: Array<{ id: string; name: string; companyId: string; targetCurrency: string }> = [];

for (const opp of candidates ?? []) {
  const companyDefault = await resolveCompanyDefault(String(opp.company_id));
  if (companyDefault === "USD") continue;
  if (!opp.lead_id) continue;

  const { data: lead } = await sb
    .from("leads")
    .select("id, currency")
    .eq("id", opp.lead_id)
    .maybeSingle();

  if (!lead || String(lead.currency ?? "USD") !== "USD") continue;

  toUpdate.push({
    id: String(opp.id),
    name: String(opp.name),
    companyId: String(opp.company_id),
    targetCurrency: companyDefault,
  });
}

console.log(
  JSON.stringify(
    {
      dryRun,
      candidateCount: candidates?.length ?? 0,
      updateCount: toUpdate.length,
      updates: toUpdate,
    },
    null,
    2,
  ),
);

if (dryRun || toUpdate.length === 0) {
  process.exit(0);
}

for (const row of toUpdate) {
  const { error } = await sb
    .from("opportunities")
    .update({ currency: row.targetCurrency, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) {
    console.error(`Failed to update ${row.id}`, error);
    process.exit(1);
  }
}

console.log(`Updated ${toUpdate.length} opportunity(ies) to company default currency.`);
