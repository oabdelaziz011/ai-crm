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

const nameFilter = process.argv[2] ?? "Currency verify EGP";
const { data, error } = await sb
  .from("opportunities")
  .select("id,name,currency,created_at,expected_revenue")
  .ilike("name", `%${nameFilter}%`)
  .order("created_at", { ascending: false })
  .limit(5);

if (error) {
  console.error(error);
  process.exit(1);
}
console.log(JSON.stringify(data, null, 2));
