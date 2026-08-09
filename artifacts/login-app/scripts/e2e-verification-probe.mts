import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

const { data: companySettings } = await sb
  .from("billing_settings")
  .select("company_id, key, value")
  .eq("key", "default_currency")
  .limit(5);

const { data: latestOpp } = await sb
  .from("opportunities")
  .select("id,name,lead_id,currency,stage_id,owner_user_id,expected_revenue,created_at,company_id")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

const companyId = process.argv[2] ?? latestOpp?.company_id;

const { data: opps } = await sb
  .from("opportunities")
  .select("id,name,lead_id,currency,stage_id,owner_user_id,expected_revenue,created_at")
  .eq("company_id", companyId)
  .order("created_at", { ascending: false })
  .limit(10);

const { data: leads } = await sb
  .from("leads")
  .select("id,name,title,contact_name,company_name,is_qualified,customer_id")
  .eq("company_id", companyId)
  .limit(20);

const { data: stages } = await sb
  .from("opportunity_stages")
  .select("id,name,pipeline_id,sort_order")
  .eq("company_id", companyId)
  .order("sort_order");

const { data: pipelines } = await sb
  .from("opportunity_pipelines")
  .select("id,name,is_default")
  .eq("company_id", companyId);

console.log(JSON.stringify({ companyId, companySettings, latestOpp, leads, opps, stages, pipelines }, null, 2));
