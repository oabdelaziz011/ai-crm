#!/usr/bin/env node
/**
 * Verify channel binding → published workflow version vs editor draft.
 *
 * Usage: node scripts/verify-channel-workflow-version.mjs [companyChannelId]
 * Env: CHANNEL_ID or COMPANY_CHANNEL_ID
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  loadDevScriptEnv,
  requireEnvValue,
  resolveArgOrEnv,
} from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const companyChannelId = resolveArgOrEnv(
  process.argv.slice(2),
  0,
  ["CHANNEL_ID", "COMPANY_CHANNEL_ID"],
  env,
  "company channel id",
);

const sb = createClient(
  requireEnvValue(env, ["SUPABASE_URL", "VITE_SUPABASE_URL"], "Supabase URL"),
  requireEnvValue(env, ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"], "Supabase service role key"),
  { auth: { persistSession: false } },
);

function summarizeNode(row) {
  const config = row.config ?? {};
  return {
    id: row.id,
    type: row.type ?? null,
    action: config.action ?? null,
    label: config.label ?? config.title ?? config.name ?? null,
    messagePreview:
      (typeof config.message === "string" && config.message.slice(0, 80)) ||
      (typeof config.body === "string" && config.body.slice(0, 80)) ||
      null,
  };
}

function walkFromTrigger(nodes, edges) {
  const trigger = nodes.find((n) => n.type === "trigger");
  if (!trigger) return [];
  const outgoing = (nodeId) =>
    edges
      .filter((e) => e.source_node_id === nodeId)
      .map((e) => nodes.find((n) => n.id === e.target_node_id))
      .filter(Boolean);

  const trail = [];
  let current = trigger;
  const visited = new Set();
  while (current && !visited.has(current.id) && trail.length < 8) {
    visited.add(current.id);
    trail.push(summarizeNode(current));
    const next = outgoing(current.id)[0];
    current = next ?? null;
  }
  return trail;
}

const binding = await sb
  .from("company_channel_automation_bindings")
  .select("id, company_id, automation_flow_id, is_enabled, updated_at")
  .eq("company_channel_id", companyChannelId)
  .is("deleted_at", null)
  .maybeSingle();

if (!binding.data) {
  console.error("No workflow binding for channel", companyChannelId);
  process.exit(1);
}

const flow = await sb
  .from("automation_flows")
  .select("id, name, status, version, active_version_id, has_unpublished_draft, updated_at")
  .eq("id", binding.data.automation_flow_id)
  .maybeSingle();

if (!flow.data) {
  console.error("Bound flow not found:", binding.data.automation_flow_id);
  process.exit(1);
}

const publishedVersionId = flow.data.active_version_id;
const [publishedVersion, draftNodesRes, publishedNodesRes, draftEdgesRes, publishedEdgesRes] =
  await Promise.all([
    publishedVersionId
      ? sb
          .from("automation_flow_versions")
          .select("id, version_number, status, published_at")
          .eq("id", publishedVersionId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from("automation_nodes").select("id, type, config").eq("flow_id", flow.data.id),
    publishedVersionId
      ? sb
          .from("automation_flow_version_nodes")
          .select("id, type, config")
          .eq("flow_version_id", publishedVersionId)
      : Promise.resolve({ data: [] }),
    sb.from("automation_edges").select("id, source_node_id, target_node_id, condition").eq("flow_id", flow.data.id),
    publishedVersionId
      ? sb
          .from("automation_flow_version_edges")
          .select("id, source_node_id, target_node_id, condition")
          .eq("flow_version_id", publishedVersionId)
      : Promise.resolve({ data: [] }),
  ]);

const draftNodes = draftNodesRes.data ?? [];
const publishedNodes = publishedNodesRes.data ?? [];
const draftEdges = draftEdgesRes.data ?? [];
const publishedEdges = publishedEdgesRes.data ?? [];

const draftTrail = walkFromTrigger(draftNodes, draftEdges);
const publishedTrail = walkFromTrigger(publishedNodes, publishedEdges);

const draftIds = new Set(draftNodes.map((n) => n.id));
const publishedIds = new Set(publishedNodes.map((n) => n.id));
const onlyInDraft = [...draftIds].filter((id) => !publishedIds.has(id));
const onlyInPublished = [...publishedIds].filter((id) => !draftIds.has(id));

const startNode = publishedTrail[0] ?? draftTrail[0] ?? null;

const report = {
  channelId: companyChannelId,
  binding: {
    id: binding.data.id,
    automationFlowId: binding.data.automation_flow_id,
    isEnabled: binding.data.is_enabled,
    updatedAt: binding.data.updated_at,
  },
  identity: {
    workflowId: flow.data.id,
    automationFlowId: flow.data.id,
    publishedVersionId,
    publishedVersionNumber: publishedVersion.data?.version_number ?? flow.data.version ?? null,
    publishedAt: publishedVersion.data?.published_at ?? null,
    flowStatus: flow.data.status,
    hasUnpublishedDraft: flow.data.has_unpublished_draft,
    bindingUsesPublishedVersion: Boolean(publishedVersionId),
    runtimeExecutesPublishedGraph: true,
    editorMayDifferFromRuntime: flow.data.has_unpublished_draft,
  },
  startNode: startNode
    ? {
        startNodeId: startNode.id,
        startNodeType: startNode.type,
        startNodeAction: startNode.action,
      }
    : null,
  publishedExecutionPath: publishedTrail.slice(0, 5).map((node, index) => ({
    sequence: index + 1,
    nodeId: node.id,
    nodeType: node.type,
    action: node.action,
    messagePreview: node.messagePreview,
  })),
  draftExecutionPath: draftTrail.slice(0, 5).map((node, index) => ({
    sequence: index + 1,
    nodeId: node.id,
    nodeType: node.type,
    action: node.action,
    messagePreview: node.messagePreview,
  })),
  graphDiff: {
    draftNodeCount: draftNodes.length,
    publishedNodeCount: publishedNodes.length,
    nodesOnlyInDraft: onlyInDraft.length,
    nodesOnlyInPublished: onlyInPublished.length,
    structuralPathsMatch:
      draftTrail.slice(0, 5).map((n) => `${n.type}:${n.action ?? ""}:${n.messagePreview ?? ""}`).join(">") ===
      publishedTrail.slice(0, 5).map((n) => `${n.type}:${n.action ?? ""}:${n.messagePreview ?? ""}`).join(">"),
  },
  findings: [],
};

if (!publishedVersionId) {
  report.findings.push("BLOCKER: Flow has no active_version_id — runtime cannot execute a published graph.");
}

if (flow.data.has_unpublished_draft) {
  report.findings.push(
    "WARNING: Editor has unpublished draft changes. Runtime executes the published version, not the draft shown in the editor.",
  );
}

if (!report.graphDiff.structuralPathsMatch) {
  report.findings.push(
    "MISMATCH: First nodes in editor draft differ structurally from published version.",
  );
} else if (onlyInDraft.length > 0) {
  report.findings.push(
    "NOTE: Draft and published graphs have the same first-node structure but different node IDs (republished draft pending).",
  );
}

const publishedWelcome = publishedTrail.find((n) => n.action === "send_message" && n.type === "action");
const draftWelcome = draftTrail.find((n) => n.action === "send_message" && n.type === "action");
if (publishedWelcome && !draftWelcome) {
  report.findings.push(
    `Published version includes Welcome send_message (${publishedWelcome.messagePreview}) but editor draft does not.`,
  );
}

console.log(JSON.stringify(report, null, 2));
