import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const RESOURCE_ID = "1c766372-7726-4cb6-b660-b88ae85fb49c";

const env = {};
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const tables = [
  ["scheduling_resource_schedules", "resource_id"],
  ["scheduling_availability_rules", "resource_id"],
  ["scheduling_weekly_availability", "resource_id"],
  ["resource_schedules", "resource_id"],
];

for (const [table, col] of tables) {
  const { data, error } = await sb.from(table).select("*").eq("company_id", COMPANY_ID).eq(col, RESOURCE_ID).limit(5);
  console.log(table, error?.message ?? data?.length ?? 0, data?.slice(0, 2));
}

const { data: resources } = await sb.from("scheduling_resources").select("id,name,status,timezone").eq("company_id", COMPANY_ID).is("deleted_at", null);
console.log("resources", resources);

const { data: bookingRules } = await sb.from("scheduling_booking_rules").select("*").eq("company_id", COMPANY_ID).limit(3);
console.log("booking_rules", bookingRules?.length, bookingRules);
