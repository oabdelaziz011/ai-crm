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
const RUN_ID = "239764a7-3051-4cb8-a5a7-ad988fbb0d2d";
const VERSION_ID = "b63cd72a-7055-46f4-b58a-ce7e998f03c9";
const WA_CONV = "a35d7fff-cac7-47f3-9604-df683e726b71";

const { data: run, error: runErr } = await sb
  .from("automation_runs")
  .select("id, flow_id, flow_version_id, company_id, status")
  .eq("id", RUN_ID)
  .single();
const { data: version, error: versionErr } = await sb
  .from("automation_flow_versions")
  .select("id, flow_id, version_number, status")
  .eq("id", VERSION_ID)
  .single();
const { data: conv, error: convErr } = await sb
  .from("conversations")
  .select("id, conversation_number, company_id")
  .eq("id", WA_CONV)
  .single();
const { data: convByNum } = await sb
  .from("conversations")
  .select("id, conversation_number, company_id")
  .eq("conversation_number", "CNV-000010");

const flowId = run?.flow_id ?? version?.flow_id ?? null;
let flow = null;
let draftCounts = null;
if (flowId) {
  const { data: flowRow } = await sb
    .from("automation_flows")
    .select("id, name, status, active_version_id, has_unpublished_draft")
    .eq("id", flowId)
    .single();
  flow = flowRow;
  const { count: nodeCount } = await sb
    .from("automation_nodes")
    .select("*", { count: "exact", head: true })
    .eq("flow_id", flowId);
  const { count: edgeCount } = await sb
    .from("automation_edges")
    .select("*", { count: "exact", head: true })
    .eq("flow_id", flowId);
  draftCounts = { nodeCount, edgeCount };
}

console.log(
  JSON.stringify(
    {
      scriptExpects: "automation_flows.id",
      run: runErr ? { error: runErr.message } : run,
      version: versionErr ? { error: versionErr.message } : version,
      conversation: convErr ? { error: convErr.message } : conv,
      allCnv000010Rows: convByNum ?? [],
      flow,
      draftGraphCounts: draftCounts,
      migrationFlowId: flowId,
    },
    null,
    2,
  ),
);
