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
const VERSION = "51022517-74a8-4179-af4f-83d220e1bbd1";

const { data: nodes } = await sb.from("automation_flow_version_nodes").select("*").eq("flow_version_id", VERSION);
const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", VERSION);
const nodeById = Object.fromEntries((nodes ?? []).map((n) => [n.id, n]));

const askNodes = (nodes ?? []).filter((n) => n.config?.action === "wait_for_input" || n.config?.action === "wait_for_reply");
console.log("=== WAIT FOR INPUT NODES ===");
for (const n of askNodes) {
  const out = (edges ?? []).filter((e) => e.source_node_id === n.id);
  console.log(JSON.stringify({
    id: n.id,
    label: n.label,
    inputKey: n.config?.inputKey,
    prompt: n.config?.prompt,
    outgoing: out.map((e) => ({
      target: e.target_node_id,
      targetLabel: nodeById[e.target_node_id]?.label,
      targetAction: nodeById[e.target_node_id]?.config?.action,
      targetBuilderType: nodeById[e.target_node_id]?.config?.builderType,
    })),
  }, null, 2));
}

const findCustomer = (nodes ?? []).find((n) => n.config?.action === "find_customer");
if (findCustomer) {
  const inEdges = (edges ?? []).filter((e) => e.target_node_id === findCustomer.id);
  console.log("\n=== FIND CUSTOMER INCOMING ===");
  for (const e of inEdges) {
    const src = nodeById[e.source_node_id];
    console.log(JSON.stringify({ from: e.source_node_id, fromLabel: src?.label, fromAction: src?.config?.action, fromInputKey: src?.config?.inputKey }, null, 2));
  }
}

// CNV-000010 recent messages with phone-like content
const { data: conv } = await sb.from("conversations").select("id").eq("conversation_number", "CNV-000010").maybeSingle();
if (conv) {
  const { data: msgs } = await sb
    .from("conversation_messages")
    .select("id, message_type, content, metadata, created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(20);
  console.log("\n=== CNV-000010 RECENT MESSAGES ===");
  for (const m of msgs ?? []) {
    console.log(JSON.stringify({ type: m.message_type, content: m.content?.slice(0, 60), created_at: m.created_at, meta: m.metadata }, null, 2));
  }

  const { data: sessions } = await sb
    .from("conversation_sessions")
    .select("*")
    .eq("conversation_id", conv.id)
    .order("updated_at", { ascending: false })
    .limit(5);
  console.log("\n=== CNV-000010 SESSIONS ===");
  for (const s of sessions ?? []) {
    console.log(JSON.stringify({
      id: s.id,
      status: s.status,
      current_node_id: s.current_node_id,
      run_id: s.run_id,
      __waitingFor: s.variables?.__waitingFor,
      customer_phone: s.variables?.customer_phone,
      customer: s.variables?.customer,
      updated_at: s.updated_at,
    }, null, 2));
  }
}
