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

const oppName = process.argv[2] ?? "Currency verify EGP 2026";
const companyId = process.argv[3] ?? "2d27f7fb-c15e-4d60-84e9-1793f36f2172";

const { data: opp } = await sb
  .from("opportunities")
  .select("id,name,currency")
  .eq("company_id", companyId)
  .eq("name", oppName)
  .maybeSingle();

if (!opp) {
  console.log(JSON.stringify({ error: "Opportunity not found", oppName }, null, 2));
  process.exit(1);
}

const [lines, history] = await Promise.all([
  sb
    .from("opportunity_line_items")
    .select("id,product_id,quantity,unit_price,subtotal,total,updated_at")
    .eq("company_id", companyId)
    .eq("opportunity_id", opp.id)
    .is("deleted_at", null),
  sb
    .from("opportunity_history")
    .select("id,event_type,field_name,previous_value,new_value,summary,payload,actor_user_id,created_at")
    .eq("company_id", companyId)
    .eq("opportunity_id", opp.id)
    .order("created_at", { ascending: false })
    .limit(30),
]);

console.log(
  JSON.stringify(
    {
      opportunity: opp,
      lines: lines.data,
      linesError: lines.error,
      history: history.data,
      historyError: history.error,
    },
    null,
    2,
  ),
);
