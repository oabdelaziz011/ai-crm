import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUN_ID = "4044afb2-c945-42bc-9bea-9202b3e7f688";
const VERSION_ID = "d61a617c-1be8-4046-b798-3c02b5e5fb7a";
const CUSTOMER_ID = "29bef3fe-4025-4d19-b1c2-c2a80907cb0c";

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

const { data: run } = await sb.from("automation_runs").select("*").eq("id", RUN_ID).single();
console.log("=== RUN ===");
console.log(JSON.stringify({ id: run.id, status: run.status, version: run.flow_version_id, current_node: run.current_node_id, started: run.started_at }, null, 2));

console.log("\n=== VARIABLES (demographics) ===");
const v = run.variables ?? {};
console.log(JSON.stringify({
  customer_gender: v.customer_gender ?? null,
  customer_age: v.customer_age ?? null,
  "customer.age": v["customer.age"] ?? null,
  "customer.gender": v["customer.gender"] ?? null,
  customer_name: v.customer_name,
  customer_phone: v.customer_phone,
  customer_entity: v.customer,
  conversation: v.conversation,
}, null, 2));

const { data: nodes } = await sb.from("automation_flow_version_nodes").select("id, type, label, config").eq("flow_version_id", VERSION_ID);
console.log("\n=== ALL VERSION NODES (action types) ===");
for (const n of nodes ?? []) {
  const action = n.config?.action ?? n.type;
  if (String(action).includes("customer") || String(action).includes("list") || n.config?.inputKey || n.config?.saveAs || n.config?.builderType === "list") {
    console.log(JSON.stringify({ id: n.id, label: n.label, action: n.config?.action, builderType: n.config?.builderType, config: n.config }, null, 2));
  }
}

console.log("\n=== NODES: ask_question / wait_for_input with saveAs/inputKey ===");
for (const n of nodes ?? []) {
  const key = n.config?.inputKey ?? n.config?.saveAs;
  if (key && (n.config?.action === "wait_for_input" || n.config?.action === "wait_for_reply" || n.config?.builderType === "ask_question")) {
    console.log(JSON.stringify({ id: n.id, label: n.label, inputKey: key, prompt: n.config?.prompt ?? n.config?.question }, null, 2));
  }
}

const { data: customer } = await sb.from("customers").select("*").eq("id", CUSTOMER_ID).single();
console.log("\n=== CUSTOMER ROW (all columns) ===");
console.log(JSON.stringify(customer, null, 2));

// Try explicit age/gender select
const { data: ag, error: agErr } = await sb.from("customers").select("age, gender").eq("id", CUSTOMER_ID).single();
console.log("\n=== age/gender column probe ===");
console.log(JSON.stringify({ data: ag, error: agErr?.message }, null, 2));

// Messages timeline for conversation
const convId = v.conversationId;
const { data: msgs } = await sb.from("conversation_messages").select("id, message_type, content, metadata, created_at").eq("conversation_id", convId).order("created_at", { ascending: true });
console.log("\n=== MESSAGE TIMELINE ===");
for (const m of msgs ?? []) {
  const c = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
  const meta = JSON.stringify(m.metadata ?? {}).slice(0, 100);
  console.log(`${m.created_at} | ${m.message_type} | ${c.slice(0, 60)} | meta=${meta}`);
}

// Version info
const { data: version } = await sb.from("automation_flow_versions").select("id, version_number, published_at, created_at").eq("id", VERSION_ID).single();
console.log("\n=== VERSION ===");
console.log(JSON.stringify(version, null, 2));
