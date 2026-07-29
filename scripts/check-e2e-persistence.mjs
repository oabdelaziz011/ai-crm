import { readFileSync } from "node:fs";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";

const env = {};
for (const line of readFileSync("D:/ValueOR/project/.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const conv = "a35d7fff-cac7-47f3-9604-df683e726b71";
const channel = "e126113b-6d0e-48d3-9296-a46aafe0cc75";

const msgs = await sb
  .from("conversation_messages")
  .select("id, role, content, created_at")
  .eq("conversation_id", conv)
  .order("created_at", { ascending: false })
  .limit(5);

const inbound = await sb
  .from("channel_inbound_events")
  .select("id, status, error_message, created_at")
  .eq("company_channel_id", channel)
  .order("created_at", { ascending: false })
  .limit(3);

const runtime = await sb
  .from("runtime_executions")
  .select("id, status, error_message, started_at")
  .eq("company_id", "2d27f7fb-c15e-4d60-84e9-1793f36f2172")
  .order("started_at", { ascending: false })
  .limit(3);

console.log(JSON.stringify({ messages: msgs.data, messagesError: msgs.error, inbound: inbound.data, inboundError: inbound.error, runtime: runtime.data, runtimeError: runtime.error }, null, 2));
