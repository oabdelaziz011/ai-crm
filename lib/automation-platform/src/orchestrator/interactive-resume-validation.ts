import { InteractiveResumeValidationError } from "../errors.js";
import { INTERACTIVE_SELECTION_INPUT_KEY } from "../runtime/conversation-variables.js";
import { readLatestOutbound } from "../runtime/outbound-queue.js";
import type { AutomationNodeRecord, AutomationRunRecord } from "../types.js";

export type InteractiveResumeValidationDiagnostics = {
  runId: string;
  currentNodeId: string;
  currentNodeAction: string | null;
  waitingFor: string | null;
  outboundKind: string | null;
  interactionType: string | null;
  replyId: string | null;
  reason: string;
};

function readNodeAction(node: AutomationNodeRecord): string | null {
  return typeof node.config.action === "string" ? node.config.action : null;
}

function readInteractionType(input: Record<string, unknown>): string | null {
  if (typeof input.interactionType === "string" && input.interactionType.trim()) {
    return input.interactionType.trim().toLowerCase();
  }
  if (input.kind === "interactive_reply" && typeof input.interactionType === "string") {
    return input.interactionType.trim().toLowerCase();
  }
  return null;
}

function isListInteraction(interactionType: string | null): boolean {
  return interactionType === "list" || interactionType === "list_reply";
}

function isButtonInteraction(interactionType: string | null): boolean {
  return (
    interactionType === "button" ||
    interactionType === "button_reply" ||
    interactionType === "buttons" ||
    interactionType === "quick_reply"
  );
}

/**
 * Ensures interactive replies target the node that owns the active wait state.
 */
export function validateInteractiveResumeInput(input: {
  run: AutomationRunRecord;
  currentNode: AutomationNodeRecord;
  resumeInput: Record<string, unknown>;
}): void {
  const waitingFor =
    typeof input.run.variables.__waitingFor === "string" ? input.run.variables.__waitingFor : null;
  if (waitingFor !== INTERACTIVE_SELECTION_INPUT_KEY) {
    return;
  }

  const nodeAction = readNodeAction(input.currentNode);
  const outbound = readLatestOutbound(input.run.variables);
  const outboundKind =
    outbound && typeof outbound.kind === "string" ? outbound.kind.trim().toLowerCase() : null;
  const interactionType = readInteractionType(input.resumeInput);
  const replyId =
    typeof input.resumeInput.replyId === "string" ? input.resumeInput.replyId.trim() : null;

  const hasInteractivePayload = Boolean(replyId || interactionType);
  if (!hasInteractivePayload) {
    return;
  }

  const diagnostics: InteractiveResumeValidationDiagnostics = {
    runId: input.run.id,
    currentNodeId: input.currentNode.id,
    currentNodeAction: nodeAction,
    waitingFor,
    outboundKind,
    interactionType,
    replyId,
    reason: "",
  };

  if (nodeAction === "send_list") {
    if (isButtonInteraction(interactionType) && !isListInteraction(interactionType)) {
      diagnostics.reason = "list_wait_node_received_button_reply";
      throw new InteractiveResumeValidationError(
        `Run ${input.run.id} is waiting on send_list node ${input.currentNode.id} but received a button reply.`,
        diagnostics,
      );
    }
    if (outboundKind === "buttons") {
      diagnostics.reason = "list_wait_node_outbound_kind_is_buttons";
      throw new InteractiveResumeValidationError(
        `Run ${input.run.id} is pinned to send_list but latest outbound is buttons.`,
        diagnostics,
      );
    }
    return;
  }

  if (nodeAction === "send_buttons") {
    if (isListInteraction(interactionType)) {
      diagnostics.reason = "button_wait_node_received_list_reply";
      throw new InteractiveResumeValidationError(
        `Run ${input.run.id} is waiting on send_buttons node ${input.currentNode.id} but received a list reply.`,
        diagnostics,
      );
    }
    if (outboundKind === "list") {
      diagnostics.reason = "button_wait_node_outbound_kind_is_list";
      throw new InteractiveResumeValidationError(
        `Run ${input.run.id} is pinned to send_buttons but latest outbound is a list message.`,
        diagnostics,
      );
    }
  }
}
