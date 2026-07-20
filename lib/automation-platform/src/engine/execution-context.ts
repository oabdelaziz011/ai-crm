import type { AutomationNodeType } from "../constants.js";
import type {
  AutomationEdgeRecord,
  AutomationFlowRecord,
  AutomationNodeRecord,
  AutomationRunRecord,
  ConversationSessionRecord,
} from "../types.js";

export type ExecutionCompany = {
  id: string;
};

export type ExecutionCustomer = {
  id: string | null;
};

export type ExecutionContext = {
  company: ExecutionCompany;
  flow: AutomationFlowRecord;
  run: AutomationRunRecord;
  session: ConversationSessionRecord;
  variables: Record<string, unknown>;
  customer: ExecutionCustomer;
  currentNode: AutomationNodeRecord;
  nodes: AutomationNodeRecord[];
  edges: AutomationEdgeRecord[];
  input?: Record<string, unknown>;
};

export type NodeExecutionOutcome = "continue" | "waiting_input" | "completed" | "failed";

export type NodeExecutionResult = {
  outcome: NodeExecutionOutcome;
  variables?: Record<string, unknown>;
  errorMessage?: string;
  output?: Record<string, unknown>;
};

export interface AutomationNodeHandler {
  readonly type: AutomationNodeType;
  validate(context: ExecutionContext): void | Promise<void>;
  execute(context: ExecutionContext): NodeExecutionResult | Promise<NodeExecutionResult>;
}

export function mergeVariables(
  current: Record<string, unknown>,
  patch?: Record<string, unknown>,
): Record<string, unknown> {
  if (!patch) return { ...current };
  return { ...current, ...patch };
}
