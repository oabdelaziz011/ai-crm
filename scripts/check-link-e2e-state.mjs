import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = env[m[1]] ?? m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: customers } = await sb.from("customers").select("*").ilike("name", "Link Verify%").order("created_at", { ascending: false }).limit(3);
console.log("customers", customers);

for (const c of customers ?? []) {
  const { data: convs } = await sb.from("conversations").select("id, customer_id, conversation_number, last_message_at").eq("customer_id", c.id);
  console.log("linked convs for", c.name, convs);
}

const { data: convsNull } = await sb.from("conversations").select("id, customer_id, conversation_number, last_message_at").eq("channel_type", "whatsapp").order("created_at", { ascending: false }).limit(5);
console.log("recent whatsapp convs", convsNull);

const { data: runs } = await sb.from("automation_runs").select("id, started_at, variables, status").order("started_at", { ascending: false }).limit(3);
for (const r of runs ?? []) {
  console.log(r.started_at, r.status, r.variables?.customer_name, r.variables?.customer?.id, r.variables?.conversationId);
}
