/**
 * Build point-in-time last_activity_at for sessions from deliveries + inbounds timeline.
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
const SENDER = "201011404109";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";

const { data: inbounds } = await sb
  .from("channel_inbound_events")
  .select("id, company_id")
  .eq("company_channel_id", CHANNEL_ID)
  .eq("sender_external_id", SENDER)
  .limit(1);
const companyId = inbounds[0].company_id;

const { data: sessions } = await sb
  .from("conversation_sessions")
  .select("*")
  .eq("company_id", companyId)
  .eq("external_user_id", SENDER)
  .eq("channel", "whatsapp")
  .order("started_at", { ascending: true });

const { data: runs } = await sb
  .from("automation_runs")
  .select("*")
  .eq("company_id", companyId)
  .order("started_at", { ascending: true });

const sessionIds = new Set(sessions.map((s) => s.id));
const userRuns = runs.filter((r) => sessionIds.has(r.session_id));

// Deliveries with automation run ids
const { data: deliveries } = await sb
  .from("channel_delivery_events")
  .select("id, created_at, metadata")
  .eq("company_channel_id", CHANNEL_ID)
  .gte("created_at", "2026-07-23T00:00:00Z")
  .order("created_at", { ascending: true });

console.log("=== KEY SESSIONS ===");
for (const id of ["dad4f358-d034-4800-8481-64181598fd48", "cc116ad7-80b8-42c8-aacd-96d6cca51f98"]) {
  const s = sessions.find((x) => x.id === id);
  console.log(JSON.stringify({ id, started_at: s?.started_at, last_activity_at: s?.last_activity_at, status: s?.status, run_id: s?.run_id }, null, 2));
}

console.log("\n=== DELIVERIES BY RUN f627b887 ===");
for (const d of (deliveries ?? []).filter((x) => x.metadata?.automationRunId === "f627b887-30ce-4c8b-a772-8be95881a49c")) {
  console.log(JSON.stringify({ created_at: d.created_at, correlationId: d.metadata?.correlationId }));
}

console.log("\n=== DELIVERIES BY RUN ff904a3a ===");
for (const d of (deliveries ?? []).filter((x) => x.metadata?.automationRunId === "ff904a3a-f827-4eb3-b64d-ca88a6d10efc")) {
  console.log(JSON.stringify({ created_at: d.created_at, correlationId: d.metadata?.correlationId }));
}

console.log("\n=== AUTOMATION SESSION MESSAGES (dad4f358) ===");
const { data: msgs } = await sb
  .from("automation_session_messages")
  .select("id, created_at, message_type, content, metadata")
  .eq("session_id", "dad4f358-d034-4800-8481-64181598fd48")
  .order("created_at", { ascending: true })
  .limit(30);
for (const m of msgs ?? []) {
  console.log(JSON.stringify({ created_at: m.created_at, type: m.message_type, content: m.content?.slice?.(0, 60) }));
}

console.log("\n=== RUN f627b887 timeline ===");
const run = userRuns.find((r) => r.id === "f627b887-30ce-4c8b-a772-8be95881a49c");
console.log(JSON.stringify({
  started_at: run?.started_at,
  status: run?.status,
  current_node_id: run?.current_node_id,
  waitingFor: run?.variables?.__waitingFor,
}, null, 2));

// All inbounds 04:00-04:40 with processing
const { data: windowInbounds } = await sb
  .from("channel_inbound_events")
  .select("id, created_at, processing_status, payload")
  .eq("company_channel_id", CHANNEL_ID)
  .eq("sender_external_id", SENDER)
  .gte("created_at", "2026-07-24T04:00:00Z")
  .lte("created_at", "2026-07-24T04:40:00Z")
  .order("created_at", { ascending: true });

console.log("\n=== INBOUNDS 04:00-04:40 ===");
for (const i of windowInbounds ?? []) {
  const msg = i.payload?.message;
  const text = msg?.text?.body ?? msg?.interactive?.list_reply?.title ?? msg?.interactive?.button_reply?.title;
  const corrDelivery = (deliveries ?? []).find((d) => d.metadata?.correlationId === i.id);
  console.log(JSON.stringify({
    id: i.id,
    at: i.created_at,
    text,
    status: i.processing_status,
    hasDelivery: Boolean(corrDelivery),
    deliveryAt: corrDelivery?.created_at ?? null,
  }));
}

// Check audit logs table name
const { data: audit, error: auditErr } = await sb
  .from("automation_audit_log")
  .select("*")
  .eq("company_id", companyId)
  .gte("created_at", "2026-07-24T04:00:00Z")
  .lte("created_at", "2026-07-24T05:00:00Z")
  .limit(5);
console.log("\n=== AUDIT ===", auditErr?.message ?? audit?.length);
