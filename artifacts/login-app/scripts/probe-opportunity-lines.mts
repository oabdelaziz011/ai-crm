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

const oppId = process.argv[2] ?? "c5090b51-b3e9-4a70-9eae-f41b111f13c8";
const companyId = process.argv[3] ?? "2d27f7fb-c15e-4d60-84e9-1793f36f2172";

const lines = await sb
  .from("opportunity_line_items")
  .select("*")
  .eq("company_id", companyId)
  .eq("opportunity_id", oppId)
  .is("deleted_at", null);

const billing = await sb.rpc("resolve_billing_setting_value", {
  p_key: "default_currency",
  p_company_id: companyId,
}).maybeSingle?.();

console.log(
  JSON.stringify(
    {
      linesError: lines.error,
      linesCount: lines.data?.length ?? 0,
      lines: lines.data,
      billing,
    },
    null,
    2,
  ),
);
