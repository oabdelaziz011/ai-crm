import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const runId = "e5f0b0a5-cddb-4aa0-ab44-e5367f9381ef";

const { data: run } = await sb.from("automation_runs").select("*").eq("id", runId).single();
const vars = run?.variables ?? {};
console.log("run status", run?.status, "version", run?.flow_version_id);
console.log("variables", {
  customer_name: vars.customer_name,
  customer_phone: vars.customer_phone,
  customer_age: vars.customer_age,
  customer_gender: vars.customer_gender,
  customer: vars.customer,
});

const customerId = vars.customer?.id;
if (customerId) {
  const { data: row } = await sb.from("customers").select("id, name, phone, age, gender").eq("id", customerId).single();
  console.log("db row", row);
}

// Also find by name
const { data: byName } = await sb.from("customers").select("id, name, phone, age, gender, created_at").ilike("name", "E2E Verify%").order("created_at", { ascending: false }).limit(3);
console.log("recent e2e customers", byName);
