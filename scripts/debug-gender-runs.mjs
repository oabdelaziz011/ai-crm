import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = env[m[1]] ?? m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Run around female list reply 2026-07-25T03:18:52
const { data: runs } = await sb
  .from("automation_runs")
  .select("id, started_at, status, variables, flow_version_id")
  .gte("started_at", "2026-07-25T03:18:00")
  .lte("started_at", "2026-07-25T03:20:00")
  .order("started_at", { ascending: true });

for (const r of runs ?? []) {
  const v = r.variables ?? {};
  console.log(JSON.stringify({
    runId: r.id,
    started_at: r.started_at,
    status: r.status,
    customer_gender: v.customer_gender,
    customer_age: v.customer_age,
    customer_name: v.customer_name,
    customer_entity_gender: v.customer?.gender,
    customer_entity_age: v.customer?.age,
    customer_id: v.customer?.id,
  }));
}

// Customer Test Age and Mona
for (const name of ["Test Age", "Mona"]) {
  const { data } = await sb.from("customers").select("id, name, age, gender").ilike("name", `%${name}%`).limit(3);
  console.log("\n", name, data);
}

// Conversation customer_id link
const { data: conv } = await sb.from("conversations").select("id, customer_id, conversation_number").eq("conversation_number", "CNV-000010").single();
console.log("\nconversation", conv);
