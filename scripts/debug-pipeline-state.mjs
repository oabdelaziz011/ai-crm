import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ids = [
  "c956fea8-592f-42fb-ad3d-429b4b6a0616",
  "ac94c180-bb29-40ed-8c03-2d857daf1102",
  "03fda7e2-0a5c-4cdc-9ec7-151beffa6a6f",
];

for (const id of ids) {
  const { data, error } = await sb.from("automation_nodes").select("id, flow_id, type, config").eq("id", id).maybeSingle();
  console.log(id, error?.message ?? "ok", data ? "found" : "missing", data?.type);
}

const { data: cols } = await sb.from("customers").select("id, age, gender").limit(1);
console.log("columns test", cols);
