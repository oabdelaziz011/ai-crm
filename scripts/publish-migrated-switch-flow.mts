/**
 * Publish migrated Switch-first draft for CNV-000010 workflow.
 * Run: node --import tsx/esm scripts/publish-migrated-switch-flow.mts
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { createAutomationPlatformServices } from "../lib/automation-platform/src/index.ts";
import { validateWorkflowSnapshot, hasBlockingPublishIssues } from "../lib/automation-platform/src/lifecycle/publish-validation.ts";
import type { WorkflowGraphSnapshot } from "../lib/automation-platform/src/lifecycle/types.ts";
import { loadSupabaseEnv, resolveSupabaseConfig } from "./lib/supabase-env.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const DEMO_PASSWORD = "DemoVault2026!";
const PLATFORM_OWNER = "demo-platform@vaultos.local";

async function signIn(url: string, key: string) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: PLATFORM_OWNER, password: DEMO_PASSWORD });
  if (error) throw new Error(error.message);
  return { client, userId: data.user!.id };
}

function makeContext(userId: string, companyId: string) {
  return {
    userId,
    companyId,
    isSuperAdmin: true,
    hasPermission: () => true,
  };
}

function draftToSnapshot(flow: Record<string, unknown>, nodes: Record<string, unknown>[], edges: Record<string, unknown>[]): WorkflowGraphSnapshot {
  return {
    name: String(flow.name ?? "Workflow"),
    description: String(flow.description ?? ""),
    triggerType: flow.trigger_type as WorkflowGraphSnapshot["triggerType"],
    metadata: (flow.metadata as Record<string, unknown>) ?? {},
    nodes: nodes.map((node) => ({
      id: node.id as string,
      type: node.type as WorkflowGraphSnapshot["nodes"][number]["type"],
      config: (node.config as Record<string, unknown>) ?? {},
      positionX: Number(node.position_x ?? 0),
      positionY: Number(node.position_y ?? 0),
    })),
    edges: edges.map((edge) => ({
      id: edge.id as string,
      sourceNodeId: edge.source_node_id as string,
      targetNodeId: edge.target_node_id as string,
      condition: (edge.condition as Record<string, unknown>) ?? {},
    })),
  };
}

async function main() {
  const env = loadSupabaseEnv(root);
  const config = resolveSupabaseConfig(env);
  if (!config) throw new Error("Supabase configuration not found.");

  const { client, userId } = await signIn(config.url, config.key);

  const { data: flow, error: flowError } = await client.from("automation_flows").select("*").eq("id", FLOW_ID).single();
  if (flowError) throw flowError;

  const [{ data: nodes, error: nodesError }, { data: edges, error: edgesError }] = await Promise.all([
    client.from("automation_nodes").select("*").eq("flow_id", FLOW_ID),
    client.from("automation_edges").select("*").eq("flow_id", FLOW_ID),
  ]);
  if (nodesError) throw nodesError;
  if (edgesError) throw edgesError;

  const snapshot = draftToSnapshot(flow, nodes ?? [], edges ?? []);
  const issues = validateWorkflowSnapshot(snapshot);
  const blocking = issues.filter((issue) => issue.severity === "error");

  console.log("Draft graph:", { nodes: snapshot.nodes.length, edges: snapshot.edges.length });
  console.log("Validation:", { errors: blocking.length, warnings: issues.length - blocking.length });
  if (blocking.length) {
    console.log(JSON.stringify(blocking, null, 2));
    throw new Error("Draft has blocking publish issues.");
  }

  const switchNode = snapshot.nodes.find((n) => n.config.mode === "switch" || n.config.builderType === "switch");
  const switchEdges = snapshot.edges.filter((e) => e.sourceNodeId === switchNode?.id);
  console.log(
    "Switch cases:",
    switchEdges.map((e) => ({
      case: e.condition.case,
      target: e.targetNodeId,
    })),
  );

  const automation = createAutomationPlatformServices(client);
  const ctx = makeContext(userId, flow.company_id as string);
  const result = await automation.publish.publish(ctx as never, {
    flowId: FLOW_ID,
    releaseNotes: "Switch-first interactive routing: book / pricing / support",
    snapshot,
  });

  const report = {
    publishedAt: new Date().toISOString(),
    flowId: FLOW_ID,
    versionId: result.version.id,
    versionNumber: result.version.version_number,
    activeVersionId: result.flow.active_version_id,
    switchNodeId: switchNode?.id,
    switchCases: switchEdges.map((e) => e.condition.case),
    validationIssues: issues,
  };

  const outDir = resolve(root, "docs/architecture");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "publish-migrated-switch-flow-report.json"), JSON.stringify(report, null, 2));

  console.log("Published successfully:");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
