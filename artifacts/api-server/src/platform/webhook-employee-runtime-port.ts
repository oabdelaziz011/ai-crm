import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChannelEmployeeRuntimePort,
  ChannelRuntimeConfigDto,
} from "@workspace/channel-platform";
import {
  buildInboundEmployeeConversationMetadata,
  resolveInboundChannelEmployee,
} from "@login-app/lib/ai-employees/services/resolve-inbound-channel-employee.js";
import { resolveEmployeeChannelRuntime } from "@login-app/lib/ai-employees/services/resolve-employee-channel-runtime.js";
import { prepareEmployeeChatRuntime } from "@login-app/lib/ai-employees/utilities/prepare-employee-chat-runtime.js";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function createWebhookEmployeeRuntimePort(client: SupabaseClient): ChannelEmployeeRuntimePort {
  return {
    async resolveForInboundChannel(input) {
      const employee = await resolveInboundChannelEmployee(
        client,
        input.companyId,
        input.channelKey,
        input.companyChannelId,
      );
      if (!employee) return null;

      return {
        aiEmployeeId: employee.id,
        conversationMetadataSeed: buildInboundEmployeeConversationMetadata(employee),
      };
    },

    async prepareForConversation(input) {
      const prepared = await prepareEmployeeChatRuntime({
        companyId: input.companyId,
        conversationId: input.conversationId,
        aiEmployeeId: input.aiEmployeeId,
        basePageContext: input.basePageContext ?? {},
        conversationMetadata: input.conversationMetadata,
        // Re-resolve only when the stored binding snapshot is incomplete.
        preferFreshBinding: true,
        bindingResolver: (companyId, aiEmployeeId) =>
          resolveEmployeeChannelRuntime(companyId, aiEmployeeId, client),
      });

      if (!prepared.executionContext || !prepared.runtimeConfigOverrides?.providerConnectionId) {
        return null;
      }

      const runtimeConfig: ChannelRuntimeConfigDto = {
        providerConnectionId: prepared.runtimeConfigOverrides.providerConnectionId,
        pageContext: prepared.pageContext,
        knowledgeRetrieval: prepared.runtimeConfigOverrides.knowledgeRetrieval,
        executionPolicy: prepared.runtimeConfigOverrides.executionPolicy ?? { streaming: false },
      };

      // Avoid an extra ai_employees getById on every WhatsApp message — seed fields
      // already live on conversation metadata / prepared pageContext.
      const metadataPatch = prepared.metadataPatch
        ? {
            ...prepared.metadataPatch,
            transferableFlowId:
              readString(prepared.metadataPatch.transferableFlowId) ??
              readString(prepared.pageContext.transferableFlowId) ??
              readString(input.conversationMetadata?.transferableFlowId) ??
              null,
          }
        : null;

      return {
        runtimeConfig,
        metadataPatch,
      };
    },
  };
}
