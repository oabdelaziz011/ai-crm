import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildVersionGraphRows,
  versionGraphRowsToExecutionRecords,
  type AutomationFlowVersionGraphRepository,
  type VersionGraphEdgeRow,
  type VersionGraphNodeRow,
} from "./version-graph-repository.js";

const NODES_TABLE = "automation_flow_version_nodes";
const EDGES_TABLE = "automation_flow_version_edges";

function mapNodeRow(row: Record<string, unknown>): VersionGraphNodeRow {
  return {
    flow_version_id: row.flow_version_id as string,
    id: row.id as string,
    flow_id: row.flow_id as string,
    type: row.type as string,
    config: (row.config as Record<string, unknown>) ?? {},
    position_x: Number(row.position_x ?? 0),
    position_y: Number(row.position_y ?? 0),
  };
}

function mapEdgeRow(row: Record<string, unknown>): VersionGraphEdgeRow {
  return {
    flow_version_id: row.flow_version_id as string,
    id: row.id as string,
    flow_id: row.flow_id as string,
    source_node_id: row.source_node_id as string,
    target_node_id: row.target_node_id as string,
    condition: (row.condition as Record<string, unknown>) ?? {},
  };
}

export function createSupabaseAutomationFlowVersionGraphRepository(
  client: SupabaseClient,
): AutomationFlowVersionGraphRepository {
  return {
    async materialize(input) {
      const { nodes, edges } = buildVersionGraphRows(input);
      if (nodes.length === 0) return;

      const { error: nodeError } = await client.from(NODES_TABLE).insert(nodes);
      if (nodeError) throw nodeError;

      if (edges.length > 0) {
        const { error: edgeError } = await client.from(EDGES_TABLE).insert(edges);
        if (edgeError) throw edgeError;
      }
    },
    async hasNode(flowVersionId, nodeId) {
      const { data, error } = await client
        .from(NODES_TABLE)
        .select("id")
        .eq("flow_version_id", flowVersionId)
        .eq("id", nodeId)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async listExecutionGraph(flowVersionId, flowId) {
      const [nodeResult, edgeResult] = await Promise.all([
        client
          .from(NODES_TABLE)
          .select("*")
          .eq("flow_version_id", flowVersionId)
          .order("created_at"),
        client
          .from(EDGES_TABLE)
          .select("*")
          .eq("flow_version_id", flowVersionId)
          .order("created_at"),
      ]);

      if (nodeResult.error) throw nodeResult.error;
      if (edgeResult.error) throw edgeResult.error;

      const nodes = (nodeResult.data ?? []).map((row) => mapNodeRow(row as Record<string, unknown>));
      const edges = (edgeResult.data ?? []).map((row) => mapEdgeRow(row as Record<string, unknown>));
      return versionGraphRowsToExecutionRecords(flowId, nodes, edges);
    },
  };
}
