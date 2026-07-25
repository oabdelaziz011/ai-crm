import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: n } = await sb.from("automation_nodes").select("config").eq("id", "3eea713e-d037-43d1-9293-5fa294f4350b").single();
console.log(JSON.stringify(n?.config, null, 2));

const { data: edges } = await sb.from("automation_edges").select("*").eq("source_node_id", "3eea713e-d037-43d1-9293-5fa294f4350b");
console.log("edges", edges);
