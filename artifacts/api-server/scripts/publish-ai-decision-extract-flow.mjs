import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve("../../.env") });

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";

const { data: flow, error: flowError } = await client
  .from("automation_flows")
  .select("*")
  .eq("id", FLOW_ID)
  .single();
if (flowError) throw flowError;

const { data: nodes, error: nodesError } = await client
  .from("automation_nodes")
  .select("id,type,config,position_x,position_y")
  .eq("flow_id", FLOW_ID);
if (nodesError) throw nodesError;

const { data: edges, error: edgesError } = await client
  .from("automation_edges")
  .select("id,source_node_id,target_node_id,condition")
  .eq("flow_id", FLOW_ID);
if (edgesError) throw edgesError;

const snapshot = {
  name: flow.name,
  description: flow.description ?? "",
  triggerType: flow.trigger_type,
  metadata: flow.metadata ?? {},
  nodes: (nodes ?? []).map((node) => ({
    id: node.id,
    type: node.type,
    config: node.config ?? {},
    positionX: node.position_x ?? 0,
    positionY: node.position_y ?? 0,
  })),
  edges: (edges ?? []).map((edge) => ({
    id: edge.id,
    sourceNodeId: edge.source_node_id,
    targetNodeId: edge.target_node_id,
    condition: edge.condition ?? {},
  })),
};

const hasDecision = snapshot.nodes.some((n) => n.config?.builderType === "ai_decision");
const hasExtract = snapshot.nodes.some((n) => n.config?.builderType === "ai_extract");
if (!hasDecision || !hasExtract) {
  throw new Error(`Missing AI nodes before publish. decision=${hasDecision} extract=${hasExtract}`);
}

const { data, error } = await client.rpc("publish_automation_workflow_version", {
  p_flow_id: FLOW_ID,
  p_company_id: COMPANY_ID,
  p_release_notes: "Enable AI Decision after menu + AI Extract after phone capture for WhatsApp runtime",
  p_snapshot: snapshot,
  p_published_by: null,
  p_flow_name: snapshot.name,
  p_flow_description: snapshot.description,
  p_flow_trigger_type: snapshot.triggerType,
  p_flow_metadata: snapshot.metadata,
  p_updated_by: null,
});

if (error) throw error;
console.log(JSON.stringify({ published: data, nodeCount: snapshot.nodes.length, edgeCount: snapshot.edges.length, hasDecision, hasExtract }, null, 2));
