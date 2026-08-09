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

const companyId = process.argv[2] ?? "2d27f7fb-c15e-4d60-84e9-1793f36f2172";

const { data: products, error } = await sb
  .from("catalog_products")
  .select("id,name,sku,is_active,base_price,currency,company_id")
  .eq("company_id", companyId)
  .limit(20);

console.log(JSON.stringify({ companyId, error, count: products?.length ?? 0, products }, null, 2));
