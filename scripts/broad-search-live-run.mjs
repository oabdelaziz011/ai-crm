/**
 * Broad search for latest live WhatsApp execution.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PHONE = process.argv[2] ?? "01023169075";

const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

console.log("SUPABASE_URL:", env.SUPABASE_URL?.slice(0, 40) + "...");
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 1. Latest automation_runs overall
const { data: latestRuns, error: runsErr } = await sb
  .from("automation_runs")
  .select("id, flow_id, status, current_node_id, waiting_input, error_message, variables, session_id, created_at, updated_at")
  .order("created_at", { ascending: false })
  .limit(20);

console.log("\n=== Latest 20 automation_runs ===");
console.log("error:", runsErr?.message);
for (const r of latestRuns ?? []) {
  console.log(`${r.created_at} | ${r.id} | ${r.status} | flow=${(r.flow_id ?? "").slice(0,8)} | phone=${r.variables?.customer_phone ?? "-"} | node=${(r.current_node_id ?? "").slice(0,8)} | err=${(r.error_message ?? "").slice(0,80)}`);
}

// 2. Search runs with phone in variables (jsonb text search via filter)
const { data: phoneRuns } = await sb
  .from("automation_runs")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(100);

const matchingRuns = (phoneRuns ?? []).filter((r) => {
  const s = JSON.stringify(r.variables ?? {});
  return s.includes(PHONE) || s.includes("1023169075");
});
console.log(`\n=== Runs containing phone ${PHONE}: ${matchingRuns.length} ===`);
for (const r of matchingRuns.slice(0, 5)) {
  console.log(JSON.stringify({ id: r.id, status: r.status, current_node_id: r.current_node_id, error_message: r.error_message, customer_phone: r.variables?.customer_phone, created_at: r.created_at }, null, 2));
}

// 3. Latest conversation_messages containing phone
const { data: messages } = await sb
  .from("conversation_messages")
  .select("id, conversation_id, direction, content, message_type, created_at, metadata")
  .order("created_at", { ascending: false })
  .limit(50);

const phoneMessages = (messages ?? []).filter((m) => {
  const c = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
  return c.includes(PHONE) || c.includes("1023169075");
});
console.log(`\n=== Messages containing phone: ${phoneMessages.length} ===`);
for (const m of phoneMessages.slice(0, 10)) {
  console.log(`${m.created_at} | ${m.direction} | ${typeof m.content === "string" ? m.content.slice(0, 80) : JSON.stringify(m.content).slice(0, 80)}`);
}

// 4. Latest sessions
const { data: sessions } = await sb
  .from("conversation_sessions")
  .select("id, status, waiting_input, current_node_id, flow_id, external_thread_id, last_activity_at, created_at")
  .order("last_activity_at", { ascending: false, nullsFirst: false })
  .limit(15);

console.log("\n=== Latest 15 conversation_sessions ===");
for (const s of sessions ?? []) {
  console.log(`${s.last_activity_at ?? s.created_at} | ${s.id} | ${s.status} | wait=${s.waiting_input} | flow=${(s.flow_id ?? "").slice(0,8)} | node=${(s.current_node_id ?? "").slice(0,8)}`);
}

// 5. If we found a matching run, deep dive
const targetRun = matchingRuns[0] ?? latestRuns?.[0];
if (targetRun) {
  const runId = targetRun.id;
  const { data: session } = targetRun.session_id
    ? await sb.from("conversation_sessions").select("*").eq("id", targetRun.session_id).single()
    : { data: null };

  let convMessages = [];
  if (session?.conversation_id) {
    const { data } = await sb.from("conversation_messages").select("*").eq("conversation_id", session.conversation_id).order("created_at", { ascending: true });
    convMessages = data ?? [];
  }

  const report = { targetRun, session, convMessages, phoneMessages, matchingRuns: matchingRuns.slice(0, 5) };
  const out = resolve(root, "docs/architecture/live-phone-reply-investigation.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log("\nDeep dive written for run:", runId);
}
