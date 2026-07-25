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

const tables = [
  "automation_runs",
  "conversation_sessions",
  "conversation_messages",
  "conversations",
  "automation_flows",
  "channel_delivery_events",
];

for (const table of tables) {
  const { count, error: countErr } = await sb.from(table).select("*", { count: "exact", head: true });
  console.log(`${table}: count=${count} err=${countErr?.message ?? "ok"}`);
}

const { data: runs, error } = await sb.from("automation_runs").select("*").order("created_at", { ascending: false }).limit(5);
console.log("\nLatest runs error:", error?.message);
console.log("Latest runs:", runs?.length);
if (runs?.[0]) console.log(JSON.stringify(runs[0], null, 2));

const { data: flows } = await sb.from("automation_flows").select("id, name, active_version_id, company_id, updated_at").order("updated_at", { ascending: false }).limit(5);
console.log("\nFlows:", JSON.stringify(flows, null, 2));

// Search all runs for phone
const { data: allRuns } = await sb.from("automation_runs").select("*").order("created_at", { ascending: false }).limit(200);
const phone = "01023169075";
const matches = (allRuns ?? []).filter((r) => JSON.stringify(r).includes("1023169075") || JSON.stringify(r).includes(phone));
console.log(`\nPhone matches in last 200 runs: ${matches.length}`);
for (const m of matches) {
  console.log(JSON.stringify({ id: m.id, status: m.status, current_node_id: m.current_node_id, error_message: m.error_message, variables: m.variables, created_at: m.created_at }, null, 2));
}

// Search messages
const { data: allMsgs } = await sb.from("conversation_messages").select("*").order("created_at", { ascending: false }).limit(200);
const msgMatches = (allMsgs ?? []).filter((m) => JSON.stringify(m).includes("1023169075") || JSON.stringify(m).includes(phone));
console.log(`\nPhone matches in last 200 messages: ${msgMatches.length}`);
for (const m of msgMatches.slice(0, 5)) {
  console.log(JSON.stringify({ id: m.id, direction: m.direction, content: m.content, created_at: m.created_at, metadata: m.metadata }, null, 2));
}

const out = resolve(root, "docs/architecture/live-phone-reply-investigation.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ matches, msgMatches, latestRun: runs?.[0], flows, allRunsCount: allRuns?.length }, null, 2));
