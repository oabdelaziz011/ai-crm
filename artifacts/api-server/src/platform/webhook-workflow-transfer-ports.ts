import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowTransferToolPorts } from "@workspace/ai-tool-router";
import {
  createSupabaseAutomationRunRepository,
  createSupabaseConversationSessionRepository,
  type AutomationPlatformServices,
  type ServiceContext as AutomationServiceContext,
} from "@workspace/automation-platform";
import { createChannelAutomationPort } from "./channel-automation-port.js";

const SYSTEM_CONTEXT: AutomationServiceContext = {
  userId: null,
  companyId: null,
  isSuperAdmin: true,
  hasPermission: () => true,
};

function readTransferableFlowId(runtimeConfiguration: unknown): string | null {
  if (!runtimeConfiguration || typeof runtimeConfiguration !== "object") return null;
  const value = (runtimeConfiguration as Record<string, unknown>).transferableFlowId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function createWebhookWorkflowTransferPorts(
  client: SupabaseClient,
  automationEngine: AutomationPlatformServices["engine"],
): WorkflowTransferToolPorts {
  const automation = createChannelAutomationPort(automationEngine, SYSTEM_CONTEXT, {
    sessions: createSupabaseConversationSessionRepository(client),
    runs: createSupabaseAutomationRunRepository(client),
  });

  return {
    async transferToWorkflow(input) {
      const { data: conversation, error: conversationError } = await client
        .from("conversations")
        .select("id, company_id, metadata")
        .eq("id", input.conversationId)
        .maybeSingle();
      if (conversationError) throw conversationError;
      if (!conversation || conversation.company_id !== input.companyId) {
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
          .eq("company_id", input.companyId)
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
      const automationResult = await automation.startWorkflow({
        companyId: input.companyId,
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
        .eq("company_id", input.companyId);
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
