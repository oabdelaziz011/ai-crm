import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowTransferToolPorts } from "../tools/workflow-transfer-tools.js";

export type WorkflowTransferStartWorkflowInput = {
  companyId: string;
  flowId: string;
  channelKey: string;
  externalUserId: string;
  messageText: string;
  initialVariables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type WorkflowTransferStartWorkflowResult = {
  runId: string | null;
  responseContent?: string | null;
};

export type WorkflowTransferStartWorkflow = (
  input: WorkflowTransferStartWorkflowInput,
) => Promise<WorkflowTransferStartWorkflowResult>;

export type CreateWorkflowTransferToolPortsOptions = {
  /**
   * Trusted product company id (login-app). When set, input.companyId must match.
   * Webhook path omits this and relies on conversation.company_id === input.companyId.
   */
  trustedCompanyId?: string | null;
};

function readTransferableFlowId(runtimeConfiguration: unknown): string | null {
  if (!runtimeConfiguration || typeof runtimeConfiguration !== "object") return null;
  const value = (runtimeConfiguration as Record<string, unknown>).transferableFlowId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Shared Workflow Transfer port used by webhook and login-app ToolRouter factories.
 * Product gates (assignment + commercial) sit outside; this port enforces tenant/conversation
 * binding and starts the existing automation/workflow bridge via `startWorkflow`.
 */
export function createWorkflowTransferToolPorts(
  client: SupabaseClient,
  startWorkflow: WorkflowTransferStartWorkflow,
  options?: CreateWorkflowTransferToolPortsOptions,
): WorkflowTransferToolPorts {
  return {
    async transferToWorkflow(input) {
      let companyId = typeof input.companyId === "string" ? input.companyId.trim() : "";
      if (options?.trustedCompanyId !== undefined) {
        const trusted =
          typeof options.trustedCompanyId === "string" ? options.trustedCompanyId.trim() : "";
        if (!trusted) {
          throw new Error("Company context is required for workflow transfer.");
        }
        if (companyId !== trusted) {
          throw new Error("Company context mismatch for workflow transfer.");
        }
        companyId = trusted;
      }
      if (!companyId) {
        throw new Error("Company context is required for workflow transfer.");
      }

      const { data: conversation, error: conversationError } = await client
        .from("conversations")
        .select("id, company_id, metadata")
        .eq("id", input.conversationId)
        .maybeSingle();
      if (conversationError) throw conversationError;
      if (!conversation || conversation.company_id !== companyId) {
        throw new Error("Conversation not found for workflow transfer.");
      }

      const metadata =
        conversation.metadata && typeof conversation.metadata === "object"
          ? (conversation.metadata as Record<string, unknown>)
          : {};
      const aiEmployeeId =
        typeof metadata.aiEmployeeId === "string" && metadata.aiEmployeeId.trim()
          ? metadata.aiEmployeeId.trim()
          : null;

      let allowedFlowId: string | null = null;
      if (aiEmployeeId) {
        const { data: employee, error: employeeError } = await client
          .from("ai_employees")
          .select("id, runtime_configuration, allowed_tool_keys")
          .eq("id", aiEmployeeId)
          .eq("company_id", companyId)
          .maybeSingle();
        if (employeeError) throw employeeError;
        allowedFlowId = readTransferableFlowId(employee?.runtime_configuration);
        const allowedTools = Array.isArray(employee?.allowed_tool_keys)
          ? employee.allowed_tool_keys.map(String)
          : [];
        if (!allowedTools.includes("transfer_to_workflow")) {
          throw new Error("transfer_to_workflow is not enabled on this AI employee.");
        }
      }

      const requestedFlowId =
        typeof input.flowId === "string" && input.flowId.trim() ? input.flowId.trim() : null;
      const flowId = requestedFlowId ?? allowedFlowId;
      if (!flowId) {
        throw new Error("No transferable workflow is configured on this AI employee.");
      }
      if (allowedFlowId && flowId !== allowedFlowId) {
        throw new Error("Requested workflow is not allowed for this AI employee.");
      }

      const { data: session, error: sessionError } = await client
        .from("channel_sessions")
        .select("*")
        .eq("conversation_id", input.conversationId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!session) {
        throw new Error("No channel session found for this conversation.");
      }

      const externalUserId =
        (typeof session.sender_external_id === "string" && session.sender_external_id.trim()
          ? session.sender_external_id.trim()
          : null) ??
        (typeof session.external_thread_id === "string" ? session.external_thread_id : null);
      if (!externalUserId) {
        throw new Error("Channel session is missing external user id.");
      }

      const kickoffText = input.reason.trim() || "ابدأ المسار";
      const automationResult = await startWorkflow({
        companyId,
        flowId,
        channelKey: String(session.channel_key),
        externalUserId,
        messageText: kickoffText,
        initialVariables: {
          lastMessage: kickoffText,
          companyChannelId: session.company_channel_id,
          conversationId: input.conversationId,
          channelSessionId: session.id,
          transferredFromAi: true,
          transferReason: input.reason,
        },
        metadata: {
          companyChannelId: session.company_channel_id,
          transferredFromAi: true,
          transferReason: input.reason,
          aiEmployeeId,
        },
      });

      const nextMetadata = {
        ...metadata,
        inboundWorkflowTransfer: {
          active: true,
          flowId,
          runId: automationResult.runId ?? null,
          transferredAt: new Date().toISOString(),
          transferredByEmployeeId: aiEmployeeId,
          reason: input.reason,
        },
      };

      const { error: updateError } = await client
        .from("conversations")
        .update({ metadata: nextMetadata, updated_at: new Date().toISOString() })
        .eq("id", input.conversationId)
        .eq("company_id", companyId);
      if (updateError) throw updateError;

      const responseContent =
        typeof automationResult.responseContent === "string" && automationResult.responseContent.trim()
          ? automationResult.responseContent.trim()
          : null;

      return {
        transferred: true,
        flowId,
        runId: automationResult.runId ?? null,
        responseContent,
        customerFacingMessage:
          responseContent ??
          "تم تحويلك الآن لمسار الخدمة. كمّل الخطوات اللي هتظهر لك.",
      };
    },
  };
}
