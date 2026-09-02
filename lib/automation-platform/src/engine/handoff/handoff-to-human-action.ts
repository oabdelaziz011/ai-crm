import { ValidationError } from "../../errors.js";
import {
  HANDOFF_ESCALATION_TRIGGERS,
  type HandoffEscalationTrigger,
  type HandoffServicePort,
} from "../../ports/handoff-service-port.js";
import type { ExecutionContext, NodeExecutionResult } from "../execution-context.js";
import { mergeVariables } from "../execution-context.js";

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readTriggerCode(value: unknown): HandoffEscalationTrigger {
  const normalized = readString(value) ?? "customer_requested";
  if (!HANDOFF_ESCALATION_TRIGGERS.includes(normalized as HandoffEscalationTrigger)) {
    throw new ValidationError(
      `handoff_to_human triggerCode must be one of: ${HANDOFF_ESCALATION_TRIGGERS.join(", ")}.`,
    );
  }
  return normalized as HandoffEscalationTrigger;
}

function readConversationId(context: ExecutionContext): string {
  const fromVariables = readString(context.variables.conversationId);
  if (fromVariables) return fromVariables;
  const fromMetadata = readString(context.run.metadata?.conversationId);
  if (fromMetadata) return fromMetadata;
  throw new ValidationError("handoff_to_human requires conversationId in workflow variables.");
}

function readAiAssistantId(context: ExecutionContext): string | undefined {
  const candidates = [
    context.variables.aiAssistantId,
    context.run.metadata?.aiAssistantId,
    context.session.metadata?.aiAssistantId,
  ];
  for (const candidate of candidates) {
    const value = readString(candidate);
    if (value) return value;
  }
  return undefined;
}

export function validateHandoffToHumanConfig(config: Record<string, unknown>): void {
  const queueId = readString(config.queueId);
  if (config.queueId != null && !queueId) {
    throw new ValidationError("handoff_to_human queueId must be a non-empty string when provided.");
  }
  readTriggerCode(config.triggerCode ?? "customer_requested");
}

export async function executeHandoffToHumanAction(
  context: ExecutionContext,
  config: Record<string, unknown>,
  handoffService: HandoffServicePort,
): Promise<NodeExecutionResult> {
  validateHandoffToHumanConfig(config);

  const conversationId = readConversationId(context);
  const result = await handoffService.requestCustomerHandoff({
    companyId: context.company.id,
    conversationId,
    queueId: readString(config.queueId) ?? undefined,
    reason: readString(config.reason) ?? "Customer requested human support",
    triggerCode: readTriggerCode(config.triggerCode ?? "customer_requested"),
    aiAssistantId: readAiAssistantId(context),
  });

  return {
    outcome: "continue",
    variables: mergeVariables(context.variables, {
      __handoffCompleted: true,
      handoffAssigned: result.assigned,
      handoffQueued: result.queued,
      handoffAssigneeUserId: result.assigneeUserId ?? null,
      handoffQueueId: result.queueId ?? null,
    }),
    output: {
      handoff: result,
    },
  };
}
