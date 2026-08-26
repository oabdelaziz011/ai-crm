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
import {
  applyPostWelcomeSystemPrompt,
  resolvePersonalizedWelcomeMessage,
} from "@login-app/lib/ai-employees/utilities/resolve-ai-employee-welcome-message.js";
import { createAiEmployeeServices } from "@login-app/lib/ai-employees/index.js";
import { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } from "@login-app/lib/ai-employees/adapters/ai-employee-runtime-types.js";
import {
  appendSchedulingCatalogPrompt,
  resolveSchedulingCatalogPromptForEmployee,
} from "@login-app/lib/ai-employees/utilities/scheduling-catalog-prompt.js";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}


function applyTrustedChannelIdentityPromptOverrides(
  pageContext: Record<string, unknown>,
  options?: { suppressWelcomePrompt?: boolean },
): Record<string, unknown> {
  const trustedCustomerId =
    typeof pageContext.trustedCustomerId === "string" ? pageContext.trustedCustomerId.trim() : "";
  const trustedCustomerName =
    typeof pageContext.trustedCustomerName === "string"
      ? pageContext.trustedCustomerName.trim().replace(/[\r\n]+/g, " ").slice(0, 80)
      : "";

  let next: Record<string, unknown> = { ...pageContext };
  const systemPrompt = typeof next.systemPrompt === "string" ? next.systemPrompt : "";
  const welcomeMessage = typeof next.welcomeMessage === "string" ? next.welcomeMessage : "";

  if (trustedCustomerName && !options?.suppressWelcomePrompt) {
    const knownGreeting = `أهلاً يا ${trustedCustomerName} 👋`;
    const personalized =
      welcomeMessage.trim() && !/^أهلاً يا /.test(welcomeMessage.trim())
        ? `${knownGreeting}\n${welcomeMessage.trim()}`
        : knownGreeting;
    next = { ...next, welcomeMessage: personalized };
    if (systemPrompt.includes("Configured welcome message:")) {
      next.systemPrompt = systemPrompt.replace(
        /Configured welcome message:\n[\s\S]*$/,
        `Configured welcome message:\n${personalized}\n\nCRITICAL TRUSTED WELCOME RULES:\n- Deliver the welcome exactly. Never invent or substitute a different customer name.\n- Never use WhatsApp profile names.`,
      );
    } else if (systemPrompt) {
      next.systemPrompt = [
        systemPrompt,
        "CRITICAL TRUSTED WELCOME RULES:",
        `- On first contact, greet exactly: ${knownGreeting}`,
        "- Never invent or substitute a different customer name. Never use WhatsApp profile names.",
      ].join("\n");
    }
  } else if (options?.suppressWelcomePrompt && systemPrompt) {
    next.systemPrompt = applyPostWelcomeSystemPrompt(systemPrompt);
  }

  if (trustedCustomerId) {
    const identityAddon = [
      "CRITICAL TRUSTED CHANNEL IDENTITY:",
      `- This conversation already has trustedCustomerId=${trustedCustomerId}.`,
      "- Customer identity is already resolved from the trusted WhatsApp sender → CRM match.",
      "- Do NOT ask for name or mobile merely to identify the customer.",
      "- Do NOT call create_customer merely to identify them.",
      "- create_booking MUST use this trustedCustomerId.",
      "- Never invent a customerId and never let an LLM customerId override trusted identity.",
      "- Still require genuine booking details: service, resource, slot selection, and confirmation rules.",
    ].join("\n");
    const prompt = typeof next.systemPrompt === "string" ? next.systemPrompt : "";
    if (!prompt.includes("CRITICAL TRUSTED CHANNEL IDENTITY")) {
      next.systemPrompt = [prompt, identityAddon].filter(Boolean).join("\n\n");
    }
  } else if (
    pageContext.channelIdentityStatus === "ambiguous" ||
    pageContext.channelIdentityStatus === "conflict_stale_bind"
  ) {
    const blockAddon = [
      "CRITICAL CHANNEL IDENTITY BLOCK:",
      "- WhatsApp sender identity cannot be trusted for customer-sensitive mutations yet.",
      "- Do NOT pick a CRM customer arbitrarily.",
      "- Do NOT create a new customer automatically for this phone.",
      "- Do NOT book, cancel, or reschedule using an unverified customerId.",
      "- Ask the customer to clarify identity with support, or wait until CRM duplicates are resolved.",
    ].join("\n");
    const prompt = typeof next.systemPrompt === "string" ? next.systemPrompt : "";
    if (!prompt.includes("CRITICAL CHANNEL IDENTITY BLOCK")) {
      next.systemPrompt = [prompt, blockAddon].filter(Boolean).join("\n\n");
    }
  }

  return next;
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
        sessionTimeoutMinutes:
          employee.runtimeConfiguration.sessionTimeoutMinutes ??
          DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION.sessionTimeoutMinutes,
      };
    },

    async resolveSessionTimeoutMinutes(input) {
      const companyId = input.companyId.trim();
      const aiEmployeeId = input.aiEmployeeId.trim();
      if (!companyId || !aiEmployeeId) return null;

      const services = createAiEmployeeServices(client);
      const employee = await services.registry.getById(aiEmployeeId, companyId);
      if (!employee) return null;

      return (
        employee.runtimeConfiguration.sessionTimeoutMinutes ??
        DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION.sessionTimeoutMinutes
      );
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

      const enabledToolKeys = readStringArray(prepared.pageContext?.allowedToolKeys);
      const schedulingCatalogPrompt = await resolveSchedulingCatalogPromptForEmployee(
        client,
        input.companyId,
        enabledToolKeys,
      );

      const pageContext = applyTrustedChannelIdentityPromptOverrides(
        appendSchedulingCatalogPrompt({
          ...prepared.pageContext,
          ...(schedulingCatalogPrompt ? { schedulingCatalogPrompt } : {}),
        }),
        { suppressWelcomePrompt: input.suppressWelcomePrompt === true },
      );

      if (input.suppressWelcomePrompt) {
        const systemPrompt =
          typeof pageContext.systemPrompt === "string" ? pageContext.systemPrompt : "";
        if (systemPrompt) {
          pageContext.systemPrompt = applyPostWelcomeSystemPrompt(systemPrompt);
        }
      }

      const runtimeConfig: ChannelRuntimeConfigDto = {
        providerConnectionId: prepared.runtimeConfigOverrides.providerConnectionId,
        pageContext: {
          ...pageContext,
          ...(schedulingCatalogPrompt ? { schedulingCatalogPrompt } : {}),
        },
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
              readString(pageContext.transferableFlowId) ??
              readString(input.conversationMetadata?.transferableFlowId) ??
              null,
          }
        : null;

      return {
        runtimeConfig,
        metadataPatch,
      };
    },

    async resolveWhatsAppDeterministicWelcome(input) {
      const companyId = input.companyId.trim();
      const aiEmployeeId = input.aiEmployeeId.trim();
      if (!companyId || !aiEmployeeId) return null;

      const services = createAiEmployeeServices(client);
      const employee = await services.registry.getById(aiEmployeeId, companyId);
      if (!employee || employee.status !== "published") return null;

      const welcomeText = resolvePersonalizedWelcomeMessage({
        storedWelcome: employee.welcomeMessage,
        trustedCustomerName: input.trustedCustomerName,
      });
      if (!welcomeText.trim()) return null;

      return { welcomeText };
    },
  };
}
