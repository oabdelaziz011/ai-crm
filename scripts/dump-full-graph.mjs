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
const versionId = "b63cd72a-7055-46f4-b58a-ce7e998f03c9";

const { data: nodes } = await sb.from("automation_flow_version_nodes").select("*").eq("flow_version_id", versionId);
const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", versionId);

const nl = (id) => {
  const n = nodes.find((x) => x.id === id);
  const action = n?.config?.action;
  const preview = action === "send_message" ? (n.config.message ?? "").slice(0, 50) : action === "send_list" ? (n.config.body ?? "").slice(0, 50) : action;
  return { id, label: n?.label, type: n?.type, action, preview };
};

function walk(fromId, depth = 0, seen = new Set()) {
  if (depth > 12 || seen.has(fromId)) return;
  seen.add(fromId);
  const info = nl(fromId);
  console.log("  ".repeat(depth) + JSON.stringify(info));
  for (const e of edges.filter((x) => x.source_node_id === fromId)) {
    const branch = e.condition?.branch ?? e.condition?.case ?? "*";
    console.log("  ".repeat(depth) + `  --[${branch}]-->`);
    walk(e.target_node_id, depth + 1, new Set(seen));
  }
}

console.log("=== FULL GRAPH FROM TRIGGER ===");
const trigger = nodes.find((n) => n.type === "trigger");
walk(trigger.id, 0);

console.log("\n=== send_message nodes ===");
for (const n of nodes.filter((x) => x.config?.action === "send_message")) {
  console.log(JSON.stringify({ id: n.id, label: n.label, message: (n.config.message ?? "").slice(0, 80) }));
}

console.log("\n=== dab15807 list rows ===");
const docList = nodes.find((x) => x.id === "dab15807-9a9a-41e1-b8c5-15c6e40a7a80");
console.log(JSON.stringify(docList?.config?.sections, null, 2));

console.log("\n=== 0f6a350e list ===");
const resList = nodes.find((x) => x.id === "0f6a350e-712e-4e0f-b37f-a67cefcdc232");
console.log(JSON.stringify({ body: resList?.config?.body, sections: resList?.config?.sections }, null, 2));

// Find node with Dr3=3000 message
for (const n of nodes.filter((x) => x.config?.action === "send_message")) {
  if (String(n.config.message).includes("Dr3") || String(n.config.message).includes("3000")) {
    console.log("\n=== DR3 PRICING MESSAGE NODE ===");
    console.log(JSON.stringify(nl(n.id)));
    console.log(n.config.message);
  }
}
