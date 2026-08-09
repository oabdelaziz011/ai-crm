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

for (const fn of ["get_billing_setting", "resolve_billing_setting_value"]) {
  const { data, error } = await sb.rpc(fn, {
    p_code: "default_currency",
    p_company_id: companyId,
  });
  console.log(fn, error?.message ?? data);
}

const { data: view } = await sb
  .from("company_billing_settings")
  .select("*")
  .eq("company_id", companyId)
  .maybeSingle();
console.log("company_billing_settings view:", view);

const { data: overrides } = await sb
  .from("billing_setting_overrides")
  .select("setting_code, value")
  .eq("company_id", companyId)
  .eq("setting_code", "default_currency");
console.log("billing_setting_overrides:", overrides);
