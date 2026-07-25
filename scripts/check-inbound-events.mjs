import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
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

// inbound events tables
for (const table of ["channel_inbound_events", "inbound_events", "webhook_events"]) {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
  console.log(`${table}: ${count} ${error?.message ?? "ok"}`);
}

const { data: inbound } = await sb.from("channel_inbound_events").select("*").order("created_at", { ascending: false }).limit(20);
console.log("\n=== Recent inbound events ===");
for (const e of inbound ?? []) {
  if (JSON.stringify(e).includes("01023169075") || JSON.stringify(e).includes(RUN_ID) || JSON.stringify(e).includes("e015ea13")) {
    console.log(JSON.stringify({
      id: e.id,
      created_at: e.created_at,
      processing_status: e.processing_status,
      error_message: e.error_message,
      payload: e.payload?.messages?.[0]?.text?.body ?? e.raw_payload,
      metadata: e.metadata,
    }, null, 2));
  }
}

// session for run
const { data: run } = await sb.from("automation_runs").select("*").eq("id", RUN_ID).single();
const { data: session } = await sb.from("conversation_sessions").select("*").eq("id", run.session_id).single();
console.log("\n=== Session ===", JSON.stringify(session, null, 2));

// Compare v10 vs v11 find customer binding
const { data: v10 } = await sb.from("automation_flow_versions").select("id, version_number").eq("id", "a34fe5c4-a430-4888-834c-6c53d110aa03").single();
const { data: v11 } = await sb.from("automation_flow_versions").select("id, version_number").eq("id", "3367ea77-1207-4de9-a176-481b0c6283de").single();
const { data: v10find } = await sb.from("automation_flow_version_nodes").select("config").eq("flow_version_id", "a34fe5c4-a430-4888-834c-6c53d110aa03").filter("config->>action", "eq", "find_customer");
const { data: v11find } = await sb.from("automation_flow_version_nodes").select("config").eq("flow_version_id", "3367ea77-1207-4de9-a176-481b0c6283de").filter("config->>action", "eq", "find_customer");

console.log("\n=== Version comparison ===");
console.log("v10 find:", JSON.stringify(v10find?.[0]?.config));
console.log("v11 find:", JSON.stringify(v11find?.[0]?.config));

// Simulate binding resolution
const vars = run.variables;
const scope = { ...vars, customer: { id: null } };
function resolveFieldValue(path, scope) {
  const m = path.match(/^\{\{(.+)\}\}$/);
  if (!m) return path;
  const parts = m[1].split(".");
  let cur = scope;
  for (const p of parts) { cur = cur?.[p]; }
  return cur ?? "";
}
const resolved = resolveFieldValue("{{customer.phone}}", scope);
console.log("\n=== Binding simulation ===");
console.log("customer_phone in scope:", scope.customer_phone);
console.log("customer.phone resolved:", resolved);
console.log("Would throw: Create booking requires lookup value.");
