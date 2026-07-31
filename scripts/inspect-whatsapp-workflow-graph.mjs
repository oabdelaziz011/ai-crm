/**
 * Print the active workflow graph for the WhatsApp channel binding to explain
 * node order (Welcome vs List) without running the webhook stack.
 *
 * Usage: node scripts/inspect-whatsapp-workflow-graph.mjs [companyChannelId]
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  createServiceRoleSupabaseClient,
  loadDevScriptEnv,
  resolveChannelId,
} from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const args = process.argv.slice(2);
const pathOnly = args.includes("--path-only");
const companyChannelId = resolveChannelId(args, env);
const sb = createServiceRoleSupabaseClient(env, createClient);
function summarizeNode(row) {
  const config = row.config ?? {};
  return {
    id: row.id,
    type: row.type ?? null,
    action: config.action ?? null,
    label: config.label ?? config.title ?? config.name ?? null,
    primaryMenu: config.primaryMenu === true,
    messagePreview:
      (typeof config.message === "string" && config.message.slice(0, 80)) ||
      (typeof config.body === "string" && config.body.slice(0, 80)) ||
      null,
  };
}

const binding = await sb
  .from("company_channel_automation_bindings")
  .select("automation_flow_id, is_enabled")
  .eq("company_channel_id", companyChannelId)
  .is("deleted_at", null)
  .maybeSingle();

if (!binding.data) {
  console.error("No workflow binding for channel", companyChannelId);
  process.exit(1);
}

const flow = await sb
  .from("automation_flows")
  .select("id, name, status, active_version_id")
  .eq("id", binding.data.automation_flow_id)
  .maybeSingle();

const versionId = flow.data?.active_version_id;
const version = versionId
  ? await sb
      .from("automation_flow_versions")
      .select("id, version_number, status")
      .eq("id", versionId)
      .maybeSingle()
  : { data: null };

const nodesRes = versionId
  ? await sb
      .from("automation_flow_version_nodes")
      .select("id, type, config, position_x, position_y")
      .eq("flow_version_id", versionId)
  : { data: [] };

const edgesRes = versionId
  ? await sb
      .from("automation_flow_version_edges")
      .select("id, source_node_id, target_node_id, condition")
      .eq("flow_version_id", versionId)
  : { data: [] };

const nodes = (nodesRes.data ?? []).map((row) => summarizeNode(row));
const edges = edgesRes.data ?? [];

const trigger = nodes.find((n) => n.type === "trigger");
const outgoingFrom = (nodeId) =>
  edges
    .filter((e) => e.source_node_id === nodeId)
    .map((e) => ({
      edgeId: e.id,
      target: nodes.find((n) => n.id === e.target_node_id) ?? { id: e.target_node_id },
      condition: e.condition ?? null,
    }));

function walkPath(startId, depth = 0, visited = new Set()) {
  if (!startId || visited.has(startId) || depth > 12) return [];
  visited.add(startId);
  const node = nodes.find((n) => n.id === startId);
  if (!node) return [];
  const step = { depth, node, outgoing: outgoingFrom(startId) };
  const children = [];
  for (const edge of step.outgoing) {
    children.push(...walkPath(edge.target.id, depth + 1, visited));
  }
  return [step, ...children];
}

const executionPath = trigger ? walkPath(trigger.id) : [];

if (pathOnly) {
  console.log(JSON.stringify(executionPath.slice(0, 15), null, 2));
  process.exit(0);
}

console.log(
  JSON.stringify(
    {
      channelId: companyChannelId,
      binding: binding.data,
      flow: flow.data,
      version: version.data,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodes,
      executionPath: executionPath.map(({ depth, node, outgoing }) => ({
        depth,
        node,
        outgoing: outgoing.map((o) => ({
          targetId: o.target.id,
          targetAction: o.target.action ?? o.target.type,
          targetPreview: o.target.messagePreview ?? o.target.label,
          condition: o.condition,
        })),
      })),
    },
    null,
    2,
  ),
);
