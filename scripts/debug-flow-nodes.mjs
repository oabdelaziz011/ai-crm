import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: flow } = await sb.from("automation_flows").select("active_version_id").eq("id", "aef7c4ab-513a-4b64-a700-2be6cf51dafc").single();
const { data: ver } = await sb.from("automation_flow_versions").select("version_number").eq("id", flow.active_version_id).single();
const ids = ["5227f658-74d5-44a5-a30e-4256ea9eb111", "53e0708a-3dcd-4bda-9892-7b55425f1cdf", "26471c3d-0527-4d76-a5ce-4bb22c8df013"];
for (const id of ids) {
  const { data: d } = await sb.from("automation_nodes").select("config").eq("id", id).single();
  const { data: v } = await sb.from("automation_flow_version_nodes").select("config").eq("flow_version_id", flow.active_version_id).eq("id", id).single();
  console.log("\n", id.slice(0,8), "draft inputKey/fields:", d?.config?.inputKey, d?.config?.ageField, d?.config?.genderField);
  console.log("published:", v?.config?.inputKey, v?.config?.ageField);
  if (id.startsWith("5227")) console.log("gender rows", JSON.stringify(v?.config?.sections?.[0]?.rows));
}
console.log("active version", ver?.version_number);
