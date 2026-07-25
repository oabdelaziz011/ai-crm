import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = env[m[1]] ?? m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const runId = "befbd3d4-1b20-4a9e-a445-1c87ab192cdb";

const { data: run } = await sb.from("automation_runs").select("variables").eq("id", runId).single();
const convId = run?.variables?.conversation?.id ?? run?.variables?.conversationId;

const { data: conv } = convId
  ? await sb.from("conversations").select("id, customer_id, conversation_number").eq("id", convId).single()
  : { data: null };

console.log(JSON.stringify({
  conversationIdFromRun: convId,
  conversation: conv,
  customerFromRun: run?.variables?.customer,
}, null, 2));
