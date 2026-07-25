/**
 * Fix Find Customer binding: {{customer.phone}} -> {{customer_phone}}
 * Then publish workflow.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createAutomationPlatformServices } from "../lib/automation-platform/src/index.ts";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const FIND_DRAFT_ID = "2da94711-d616-4846-8383-c1b1084f0bb3";
const DEMO_PASSWORD = "DemoVault2026!";
const PLATFORM_OWNER = "demo-platform@vaultos.local";

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
const { data: auth } = await sb.auth.signInWithPassword({ email: PLATFORM_OWNER, password: DEMO_PASSWORD });
const userId = auth.user?.id;
if (!userId) throw new Error("Auth failed");

const { data: before } = await sb.from("automation_nodes").select("config").eq("id", FIND_DRAFT_ID).single();
const nextConfig = {
  ...(before?.config ?? {}),
  value: { mode: "variable", variable: "{{customer_phone}}" },
};

const { data: updated, error: updateError } = await sb
  .from("automation_nodes")
  .update({ config: nextConfig })
  .eq("id", FIND_DRAFT_ID)
  .select("id,config")
  .single();
if (updateError) throw updateError;

const { data: flow } = await sb.from("automation_flows").select("*").eq("id", FLOW_ID).single();
const [{ data: nodes }, { data: edges }] = await Promise.all([
  sb.from("automation_nodes").select("*").eq("flow_id", FLOW_ID),
  sb.from("automation_edges").select("*").eq("flow_id", FLOW_ID),
]);

const snapshot = {
  name: String(flow.name ?? "Workflow"),
  description: String(flow.description ?? ""),
  triggerType: flow.trigger_type,
  metadata: flow.metadata ?? {},
  nodes: (nodes ?? []).map((node) => ({
    id: node.id,
    type: node.type,
    config: node.config ?? {},
    positionX: Number(node.position_x ?? 0),
    positionY: Number(node.position_y ?? 0),
  })),
  edges: (edges ?? []).map((edge) => ({
    id: edge.id,
    sourceNodeId: edge.source_node_id,
    targetNodeId: edge.target_node_id,
    condition: edge.condition ?? {},
  })),
};

const automation = createAutomationPlatformServices(sb);
const ctx = { userId, companyId: flow.company_id, isSuperAdmin: true, hasPermission: () => true };
const published = await automation.publish.publish(ctx, {
  flowId: FLOW_ID,
  releaseNotes: "Fix Find Customer binding regression: use customer_phone (v12)",
  snapshot,
});

const diff = {
  nodeId: FIND_DRAFT_ID,
  before: before?.config?.value,
  after: updated?.config?.value,
  versionId: published.version.id,
  versionNumber: published.version.version_number,
};

const outDir = resolve(root, "docs/architecture");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "find-customer-binding-fix.json"), JSON.stringify(diff, null, 2));
console.log(JSON.stringify(diff, null, 2));
