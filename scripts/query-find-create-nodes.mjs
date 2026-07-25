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
const VERSION = "1d8b9b25-040c-412f-a17a-422797f4eb71";

const { data: findNode } = await sb
  .from("automation_flow_version_nodes")
  .select("id,config,label")
  .eq("flow_version_id", VERSION)
  .eq("config->>action", "find_customer")
  .maybeSingle();

const { data: createNode } = await sb
  .from("automation_flow_version_nodes")
  .select("id,config,label")
  .eq("flow_version_id", VERSION)
  .eq("config->>action", "create_customer")
  .maybeSingle();

const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", VERSION);

console.log("find:", JSON.stringify(findNode, null, 2));
console.log("create:", JSON.stringify(createNode, null, 2));

if (findNode) {
  const out = edges?.filter((e) => e.source_node_id === findNode.id);
  console.log("find outgoing:", JSON.stringify(out, null, 2));
}

const { data: customers } = await sb.from("customers").select("id,name,phone,user_id").limit(5);
console.log("customers sample:", customers);
