import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = env[m[1]] ?? m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const CUTOFF = "2026-07-25T04:30:00+00:00";

const { data: runs } = await sb
  .from("automation_runs")
  .select("id, started_at, status, variables, session_id, company_id")
  .eq("flow_id", FLOW_ID)
  .gte("started_at", CUTOFF)
  .order("started_at", { ascending: false })
  .limit(10);

for (const r of runs ?? []) {
  const v = r.variables ?? {};
  const convId = v.conversationId ?? v.conversation?.id;
  const custId = v.customer?.id;
  let conv = null;
  if (convId) {
    const { data } = await sb.from("conversations").select("id, customer_id, conversation_number, last_message_at").eq("id", convId).single();
    conv = data;
  }
  console.log(JSON.stringify({
    runId: r.id,
    started_at: r.started_at,
    status: r.status,
    conversation_number: conv?.conversation_number,
    conversation_id: convId,
    conversation_customer_id: conv?.customer_id,
    run_customer_id: custId,
    customer_name: v.customer_name,
    auto_linked: conv?.customer_id === custId && custId != null,
  }));
}
