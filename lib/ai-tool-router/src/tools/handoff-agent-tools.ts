import type { ConversationState } from "@workspace/ai-conversation";
import { ESCALATION_TRIGGERS } from "@workspace/human-handoff-platform";
import type { Tool, ToolExecutionContext } from "./tool-contract.js";
import type { HandoffAgentToolPorts } from "./handoff-agent-ports.js";
import { validateAgainstSchema } from "../utils/tool-utils.js";

const ACTIVE_STATES: ConversationState[] = [
  "greeting",
  "collecting_information",
  "waiting_user",
  "waiting_api",
];

function readRequiredString(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function readTriggerCode(value: unknown) {
  const normalized = readRequiredString(value, "Trigger code").toLowerCase();
  if (!ESCALATION_TRIGGERS.includes(normalized as (typeof ESCALATION_TRIGGERS)[number])) {
    throw new Error(`Trigger must be one of: ${ESCALATION_TRIGGERS.join(", ")}.`);
  }
  return normalized as (typeof ESCALATION_TRIGGERS)[number];
}

function createEscalationTool(ports: HandoffAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            reason: { type: "string", minLength: 1 },
            triggerCode: { type: "string" },
            targetQueueId: { type: "string" },
          },
          required: ["reason"],
        },
        input,
      );
    },
    async execute(context: ToolExecutionContext, input) {
      const reason = readRequiredString(input.reason, "Reason");
      const triggerCode = input.triggerCode ? readTriggerCode(input.triggerCode) : "customer_requested";
      const result = await ports.escalateToHuman({
        companyId: context.companyId,
        conversationId: context.conversationId,
        triggerCode,
        reason,
        targetQueueId: typeof input.targetQueueId === "string" ? input.targetQueueId : undefined,
        aiAssistantId: context.aiAssistantId ?? undefined,
      });
      return {
        success: true,
        escalated: true,
        reason,
        triggerCode,
        requestId: result.requestId,
        ownership: result.ownership,
      };
    },
  };
}

function createQueueHandoffTool(ports: HandoffAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            queueId: { type: "string", minLength: 1 },
            reason: { type: "string", minLength: 1 },
          },
          required: ["queueId", "reason"],
        },
        input,
      );
    },
    async execute(context: ToolExecutionContext, input) {
      const result = await ports.queueForHuman({
        companyId: context.companyId,
        conversationId: context.conversationId,
        queueId: readRequiredString(input.queueId, "Queue ID"),
        reason: readRequiredString(input.reason, "Reason"),
        aiAssistantId: context.aiAssistantId ?? undefined,
      });
      return {
        success: true,
        queued: true,
        queuePosition: result.queuePosition,
        estimatedWaitSeconds: result.estimatedWaitSeconds,
      };
    },
  };
}

export function createHandoffAgentTools(ports: HandoffAgentToolPorts): Record<string, Tool> {
  return {
    escalate_to_human: createEscalationTool(ports),
    queue_handoff: createQueueHandoffTool(ports),
    return_to_ai: createReturnToAiTool(ports),
  };
}

function createReturnToAiTool(ports: HandoffAgentToolPorts): Tool {
  return {
    supports: (state) => state === "transferred_to_human" || state === "waiting_user",
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: { reason: { type: "string", minLength: 1 } },
          required: ["reason"],
        },
        input,
      );
    },
    async execute(context: ToolExecutionContext, input) {
      const result = await ports.returnToAi({
        companyId: context.companyId,
        conversationId: context.conversationId,
        reason: readRequiredString(input.reason, "Reason"),
      });
      return { success: true, ownership: result.ownership };
    },
  };
}
