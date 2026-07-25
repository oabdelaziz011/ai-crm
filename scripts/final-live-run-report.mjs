import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const RUN_ID = "e015ea13-930f-4bb3-ab30-a444383ba2a2";
const PHONE_INBOUND_EVENT = "f7d98e20-87a6-4928-afa8-1678d0b86a02";

const { data: phoneEvent } = await sb.from("channel_inbound_events").select("*").eq("id", PHONE_INBOUND_EVENT).single();
const { data: allPhoneEvents } = await sb.from("channel_inbound_events").select("*").gte("received_at", "2026-07-25T00:30:55").lte("received_at", "2026-07-25T00:31:10").order("received_at", { ascending: true });

const { data: run } = await sb.from("automation_runs").select("*").eq("id", RUN_ID).single();
const { data: session } = await sb.from("conversation_sessions").select("*").eq("id", run.session_id).single();

// All delivery events after phone reply time
const { data: deliveriesAfterPhone } = await sb.from("channel_delivery_events").select("*").gte("created_at", "2026-07-25T00:30:58").order("created_at", { ascending: true });

// Messages after phone
const { data: msgsAfterPhone } = await sb.from("conversation_messages").select("*").eq("conversation_id", "a35d7fff-cac7-47f3-9604-df683e726b71").gte("created_at", "2026-07-25T00:30:58").order("created_at", { ascending: true });

const report = {
  runId: RUN_ID,
  phoneInboundEvent: phoneEvent,
  allInboundEventsAroundPhoneReply: allPhoneEvents,
  run: {
    id: run.id,
    status: run.status,
    current_node_id: run.current_node_id,
    error_message: run.error_message,
    flow_version_id: run.flow_version_id,
    variables: run.variables,
    started_at: run.started_at,
    finished_at: run.finished_at,
  },
  session: {
    id: session.id,
    status: session.status,
    current_node_id: session.current_node_id,
    waiting_input: session.waiting_input,
    flow_version_id: session.flow_version_id,
  },
  deliveriesAfterPhoneReply: deliveriesAfterPhone,
  messagesAfterPhoneReply: msgsAfterPhone,
  exceptionFromInboundEvent: phoneEvent?.error_message,
  note: "No stack trace is persisted in channel_inbound_events; only error_message string.",
};

const out = resolve(root, "docs/architecture/live-phone-reply-final-report.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
