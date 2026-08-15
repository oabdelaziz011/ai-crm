import type { ConversationState } from "@workspace/ai-conversation";
import type { Tool, ToolExecutionContext } from "./tool-contract.js";
import { validateAgainstSchema } from "../utils/tool-utils.js";

const ACTIVE_STATES: ConversationState[] = [
  "idle",
  "greeting",
  "collecting_information",
  "waiting_user",
  "waiting_api",
];

export type WorkflowTransferToolPorts = {
  transferToWorkflow(input: {
    companyId: string;
    conversationId: string;
    reason: string;
    flowId?: string | null;
  }): Promise<{
    transferred: boolean;
    flowId: string;
    runId: string | null;
    responseContent: string | null;
    customerFacingMessage: string;
  }>;
};

function readRequiredString(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function createTransferToWorkflowTool(ports: WorkflowTransferToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            reason: { type: "string", minLength: 1 },
            flowId: { type: "string" },
          },
          required: ["reason"],
        },
        input,
      );
    },
    async execute(context: ToolExecutionContext, input) {
      const reason = readRequiredString(input.reason, "Reason");
      const flowId = typeof input.flowId === "string" && input.flowId.trim() ? input.flowId.trim() : null;
      const result = await ports.transferToWorkflow({
        companyId: context.companyId,
        conversationId: context.conversationId,
        reason,
        flowId,
      });
      return {
        success: result.transferred,
        transferred: result.transferred,
        flowId: result.flowId,
        runId: result.runId,
        responseContent: result.responseContent,
        customerFacingMessage: result.customerFacingMessage,
        instruction:
          "Reply to the customer using customerFacingMessage (and responseContent if present). Do not invent booking lists yourself.",
      };
    },
  };
}

export function createWorkflowTransferTools(
  ports: WorkflowTransferToolPorts,
): Record<string, Tool> {
  return {
    transfer_to_workflow: createTransferToWorkflowTool(ports),
  };
}
