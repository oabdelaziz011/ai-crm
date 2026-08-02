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
import { createAiEmployeeServices } from "@login-app/lib/ai-employees/index.js";

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

      let metadataPatch = prepared.metadataPatch;
      if (metadataPatch) {
        const employee = await createAiEmployeeServices(client).registry.getById(
          input.aiEmployeeId,
          input.companyId,
        );
        if (employee) {
          metadataPatch = buildInboundEmployeeConversationMetadata(employee, metadataPatch);
        }
      }

      return {
        runtimeConfig,
        metadataPatch,
      };
    },
  };
}
