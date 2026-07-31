import { isListNodeLifecycleDebugEnabled } from "./runtime-trace-flags.js";
export { isListNodeLifecycleDebugEnabled } from "./runtime-trace-flags.js";
import type { AutomationNodeRecord } from "../types.js";

export type ListNodeLifecycleStage =
  | "before_execute_list_node"
  | "after_send_list_message"
  | "after_persist_waiting_state"
  | "after_transaction_commit"
  | "inbound_routing";

export type ListNodeLifecycleLog = {
  event: "automation.list_node_lifecycle";
  stage: ListNodeLifecycleStage;
  runId: string;
  sessionId: string;
  nodeId: string;
  nodeLabel?: string;
  listVisitIndex?: number;
  lifecycle?: string;
  currentNodeId?: string | null;
  sessionStatus?: string | null;
  runStatus?: string | null;
  waitingInput?: string | null;
  outboundQueued?: boolean;
  outboundKind?: string;
  outboundQueueLength?: number;
  executionMode?: string;
  reason?: string;
  messageTextPreview?: string;
};

let listVisitCounter = 0;
const activeListVisitByRun = new Map<string, { nodeId: string; visitIndex: number }>();

export function registerActiveListVisit(runId: string, nodeId: string, visitIndex: number): void {
  activeListVisitByRun.set(runId, { nodeId, visitIndex });
}

export function consumeActiveListVisit(runId: string, nodeId: string): number | undefined {
  const entry = activeListVisitByRun.get(runId);
  if (entry?.nodeId === nodeId) {
    activeListVisitByRun.delete(runId);
    return entry.visitIndex;
  }
  return undefined;
}

export function resetListNodeVisitCounter(): void {
  listVisitCounter = 0;
  activeListVisitByRun.clear();
}

function readNodeLabel(node: AutomationNodeRecord): string | undefined {
  const label = node.config.label ?? node.config.title ?? node.config.body ?? node.config.message;
  return typeof label === "string" && label.trim() ? label.trim().slice(0, 80) : undefined;
}

export function isSendListNode(node: AutomationNodeRecord): boolean {
  return node.type === "action" && node.config.action === "send_list";
}

export function logListNodeLifecycle(payload: Omit<ListNodeLifecycleLog, "event">): void {
  if (!isListNodeLifecycleDebugEnabled()) return;

  const line: ListNodeLifecycleLog = {
    event: "automation.list_node_lifecycle",
    ...payload,
  };

  // Structured JSON for log aggregation (pino, CloudWatch, etc.)
  console.info(JSON.stringify(line));
}

export function nextListVisitIndex(): number {
  listVisitCounter += 1;
  return listVisitCounter;
}

export function logBeforeExecuteListNode(input: {
  runId: string;
  sessionId: string;
  node: AutomationNodeRecord;
}): number {
  const visitIndex = nextListVisitIndex();
  logListNodeLifecycle({
    stage: "before_execute_list_node",
    runId: input.runId,
    sessionId: input.sessionId,
    nodeId: input.node.id,
    nodeLabel: readNodeLabel(input.node),
    listVisitIndex: visitIndex,
  });
  return visitIndex;
}

export function logAfterSendListMessage(input: {
  runId: string;
  sessionId: string;
  node: AutomationNodeRecord;
  listVisitIndex: number;
  outboundKind: string;
  outboundQueueLength: number;
}): void {
  logListNodeLifecycle({
    stage: "after_send_list_message",
    runId: input.runId,
    sessionId: input.sessionId,
    nodeId: input.node.id,
    nodeLabel: readNodeLabel(input.node),
    listVisitIndex: input.listVisitIndex,
    outboundQueued: true,
    outboundKind: input.outboundKind,
    outboundQueueLength: input.outboundQueueLength,
    waitingInput: "interactive_selection",
  });
}

export function logAfterPersistWaitingState(input: {
  runId: string;
  sessionId: string;
  nodeId: string;
  listVisitIndex?: number;
  lifecycle: string;
  currentNodeId: string | null;
  sessionStatus: string;
  runStatus: string;
  waitingInput: string | null;
  outboundQueueLength?: number;
}): void {
  logListNodeLifecycle({
    stage: "after_persist_waiting_state",
    runId: input.runId,
    sessionId: input.sessionId,
    nodeId: input.nodeId,
    listVisitIndex: input.listVisitIndex,
    lifecycle: input.lifecycle,
    currentNodeId: input.currentNodeId,
    sessionStatus: input.sessionStatus,
    runStatus: input.runStatus,
    waitingInput: input.waitingInput,
    outboundQueueLength: input.outboundQueueLength,
  });
}

export function logAfterTransactionCommit(input: {
  runId: string;
  sessionId: string;
  nodeId: string;
  listVisitIndex?: number;
  lifecycle: string;
  currentNodeId: string | null;
  sessionStatus: string;
  runStatus: string;
  waitingInput: string | null;
}): void {
  logListNodeLifecycle({
    stage: "after_transaction_commit",
    runId: input.runId,
    sessionId: input.sessionId,
    nodeId: input.nodeId,
    listVisitIndex: input.listVisitIndex,
    lifecycle: input.lifecycle,
    currentNodeId: input.currentNodeId,
    sessionStatus: input.sessionStatus,
    runStatus: input.runStatus,
    waitingInput: input.waitingInput,
  });
}

export function logInboundListNodeRouting(input: {
  runId: string | null;
  sessionId: string | null;
  currentNodeId: string | null;
  waitingInput: string | null;
  sessionStatus: string | null;
  runStatus: string | null;
  executionMode: string;
  reason: string;
  messageTextPreview?: string;
}): void {
  logListNodeLifecycle({
    stage: "inbound_routing",
    runId: input.runId ?? "none",
    sessionId: input.sessionId ?? "none",
    nodeId: input.currentNodeId ?? "none",
    currentNodeId: input.currentNodeId,
    waitingInput: input.waitingInput,
    sessionStatus: input.sessionStatus,
    runStatus: input.runStatus,
    executionMode: input.executionMode,
    reason: input.reason,
    messageTextPreview: input.messageTextPreview,
  });
}
