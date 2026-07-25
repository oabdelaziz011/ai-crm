/**
 * End-to-end trace after channel_inbound_events persistence.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const p of [resolve(projectRoot, ".env"), resolve(projectRoot, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const channelId = "e126113b-6d0e-48d3-9296-a46aafe0cc75";

const { data: binding } = await sb
  .from("channel_workflow_bindings")
  .select("automation_flow_id, is_enabled")
  .eq("company_channel_id", channelId)
  .maybeSingle();

const { data: latestInbound } = await sb
  .from("channel_inbound_events")
  .select("*")
  .eq("company_channel_id", channelId)
  .order("created_at", { ascending: false })
  .limit(5);

console.log("=== WORKFLOW BINDING ===");
console.log(JSON.stringify(binding, null, 2));

console.log("\n=== LATEST 5 INBOUND EVENTS ===");
for (const row of latestInbound ?? []) {
  const msg = row.payload?.message;
  console.log(
    JSON.stringify({
      id: row.id,
      created_at: row.created_at,
      processing_status: row.processing_status,
      error_message: row.error_message,
      external_message_id: row.external_message_id,
      sender: row.sender_external_id,
      conversation_id: row.conversation_id,
      channel_session_id: row.channel_session_id,
      messageType: msg?.type ?? null,
      replyId: msg?.interactive?.list_reply?.id ?? msg?.interactive?.button_reply?.id ?? null,
      replyTitle: msg?.interactive?.list_reply?.title ?? msg?.interactive?.button_reply?.title ?? null,
    }),
  );
}

const focus = latestInbound?.[0];
if (!focus) process.exit(0);

console.log("\n=== TRACE FOCUS: latest inbound ===");
console.log("inbound_event_id:", focus.id);
console.log("created_at:", focus.created_at);

if (focus.conversation_id) {
  const { data: conv } = await sb
    .from("conversations")
    .select("id, conversation_number, state, company_id")
    .eq("id", focus.conversation_id)
    .maybeSingle();
  console.log("\n=== CONVERSATION ===");
  console.log(JSON.stringify(conv, null, 2));

  const { data: msgs } = await sb
    .from("conversation_messages")
    .select("id, direction, content, created_at, metadata")
    .eq("conversation_id", focus.conversation_id)
    .order("created_at", { ascending: false })
    .limit(8);
  console.log("\n=== RECENT CONVERSATION MESSAGES ===");
  for (const m of msgs ?? []) {
    console.log(
      JSON.stringify({
        created_at: m.created_at,
        direction: m.direction,
        content: m.content?.slice(0, 80),
        replyId: m.metadata?.replyId ?? null,
      }),
    );
  }
}

if (focus.channel_session_id) {
  const { data: chSession } = await sb
    .from("channel_sessions")
    .select("id, conversation_id, external_thread_id, status, metadata")
    .eq("id", focus.channel_session_id)
    .maybeSingle();
  console.log("\n=== CHANNEL SESSION ===");
  console.log(JSON.stringify(chSession, null, 2));
}

const sender = focus.sender_external_id;
const companyId = focus.company_id;

const { data: autoSession } = await sb
  .from("conversation_sessions")
  .select("*")
  .eq("company_id", companyId)
  .eq("channel", "whatsapp")
  .eq("external_user_id", sender)
  .order("last_activity_at", { ascending: false })
  .limit(3);

console.log("\n=== AUTOMATION conversation_sessions (whatsapp) ===");
for (const s of autoSession ?? []) {
  console.log(
    JSON.stringify({
      id: s.id,
      run_id: s.run_id,
      flow_id: s.flow_id,
      status: s.status,
      current_node_id: s.current_node_id,
      last_activity_at: s.last_activity_at,
      waitingFor: s.variables?.__waitingFor ?? null,
      outboundQueueLen: Array.isArray(s.variables?.__outboundQueue) ? s.variables.__outboundQueue.length : 0,
    }),
  );
}

const activeSession = autoSession?.[0];
let run = null;
if (activeSession?.run_id) {
  const { data } = await sb.from("automation_runs").select("*").eq("id", activeSession.run_id).maybeSingle();
  run = data;
} else if (activeSession?.id) {
  const { data } = await sb
    .from("automation_runs")
    .select("*")
    .eq("session_id", activeSession.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  run = data;
}

console.log("\n=== AUTOMATION RUN (linked to latest session) ===");
if (run) {
  console.log(
    JSON.stringify({
      id: run.id,
      flow_id: run.flow_id,
      status: run.status,
      current_node_id: run.current_node_id,
      session_id: run.session_id,
      started_at: run.started_at,
      finished_at: run.finished_at,
      waitingFor: run.variables?.__waitingFor ?? null,
      outboundQueueLen: Array.isArray(run.variables?.__outboundQueue) ? run.variables.__outboundQueue.length : 0,
      lastOutbound: run.variables?.__outboundQueue?.[run.variables.__outboundQueue.length - 1] ?? null,
    }, null, 2),
  );
} else {
  console.log("null");
}

const { data: deliveries } = await sb
  .from("channel_delivery_events")
  .select("id, created_at, delivery_status, external_message_id, error_message, metadata")
  .eq("company_channel_id", channelId)
  .order("created_at", { ascending: false })
  .limit(10);

console.log("\n=== RECENT channel_delivery_events ===");
for (const d of deliveries ?? []) {
  console.log(
    JSON.stringify({
      created_at: d.created_at,
      delivery_status: d.delivery_status,
      external_message_id: d.external_message_id,
      error: d.error_message?.slice(0, 60) ?? null,
      automationRunId: d.metadata?.automationRunId ?? null,
    }),
  );
}

// Runs started around inbound time window (+/- 2 min)
const windowStart = new Date(new Date(focus.created_at).getTime() - 120_000).toISOString();
const windowEnd = new Date(new Date(focus.created_at).getTime() + 120_000).toISOString();
const { data: nearbyRuns } = await sb
  .from("automation_runs")
  .select("id, status, current_node_id, started_at, finished_at, flow_id, variables")
  .eq("company_id", companyId)
  .gte("started_at", windowStart)
  .lte("started_at", windowEnd)
  .order("started_at", { ascending: false });

console.log("\n=== AUTOMATION RUNS +/- 2min of inbound ===");
for (const r of nearbyRuns ?? []) {
  console.log(
    JSON.stringify({
      id: r.id,
      started_at: r.started_at,
      status: r.status,
      current_node_id: r.current_node_id,
      waitingFor: r.variables?.__waitingFor ?? null,
      outboundQueueLen: Array.isArray(r.variables?.__outboundQueue) ? r.variables.__outboundQueue.length : 0,
    }),
  );
}

// Failed inbounds recently
const { data: failed } = await sb
  .from("channel_inbound_events")
  .select("created_at, error_message, payload")
  .eq("company_channel_id", channelId)
  .eq("processing_status", "failed")
  .order("created_at", { ascending: false })
  .limit(3);
console.log("\n=== RECENT FAILED INBOUNDS ===");
for (const f of failed ?? []) {
  console.log(JSON.stringify({ created_at: f.created_at, error: f.error_message, type: f.payload?.message?.type }));
}
