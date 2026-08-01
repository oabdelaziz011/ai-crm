import type { AutomationEdgeRecord, AutomationNodeRecord } from "@workspace/automation-platform";
import type { WorkflowDocument } from "../../core/types";
import type { SimulationSnapshot, SimulationTimelineEntry } from "./simulation-types";

export type SimulationInternalSession = {
  sessionId: string;
  companyId: string;
  flowId: string;
  documentFingerprint: string;
  status: SimulationSnapshot["status"];
  document: WorkflowDocument;
  nodes: AutomationNodeRecord[];
  edges: AutomationEdgeRecord[];
  currentNodeId: string | null;
  variables: Record<string, unknown>;
  variableMutations: SimulationSnapshot["variableMutations"];
  executedNodeIds: string[];
  skippedNodeIds: string[];
  timeline: SimulationTimelineEntry[];
  logs: SimulationTimelineEntry[];
  outputs: Record<string, unknown>;
  breakpoints: Set<string>;
  startedAt: string | null;
  finishedAt: string | null;
  autoAdvance: boolean;
  pendingSimulatedInput: Record<string, unknown> | null;
};
