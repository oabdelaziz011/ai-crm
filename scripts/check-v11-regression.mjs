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

// Find draft find_customer node and compare versions
const FLOW = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const { data: flow } = await sb.from("automation_flows").select("*").eq("id", FLOW).single();
const { data: draftNodes } = await sb.from("automation_nodes").select("*").eq("flow_id", FLOW);
const findDraft = (draftNodes ?? []).find((n) => n.config?.action === "find_customer");

const { data: versions } = await sb.from("automation_flow_versions").select("id, version_number, created_at, release_notes").eq("flow_id", FLOW).order("version_number", { ascending: false }).limit(5);

for (const v of versions ?? []) {
  const { data: nodes } = await sb.from("automation_flow_version_nodes").select("config").eq("flow_version_id", v.id);
  const find = (nodes ?? []).find((n) => n.config?.action === "find_customer");
  console.log(`v${v.version_number} (${v.id.slice(0,8)}) @ ${v.created_at}`);
  console.log(`  release_notes: ${v.release_notes ?? ""}`);
  console.log(`  find binding: ${JSON.stringify(find?.config?.value)}`);
}

console.log("\nDraft find customer:");
console.log(JSON.stringify(findDraft?.config?.value));
console.log("Draft node id:", findDraft?.id);

// Webhook URL hints
const { data: channel } = await sb.from("company_channels").select("configuration").eq("id", "e126113b-6d0e-48d3-9296-a46aafe0cc75").single();
console.log("\nChannel config keys:", Object.keys(channel?.configuration ?? {}));
