/**
 * After a customer turn, qualify the open lead from stored conversation text.
 * Skips public web chat and human-owned conversations. Never fails the reply.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  conversationIsPublicWebWidget,
  LEAD_PERMISSIONS,
  preserveTrustedConversationCustomer,
  qualifyOpenLeadFromCustomerTurn,
  type LeadServiceContext,
} from "@workspace/lead-platform";
import { createSupabaseInboundAiGatePort } from "@workspace/human-handoff-platform";
import { logger } from "../lib/logger.js";

export {
  conversationIsPublicWebWidget,
  qualifyOpenLeadFromCustomerTurn,
  shouldApplyAutomaticSalesQualification,
} from "@workspace/lead-platform";

const SALES_AI_PERMISSIONS = new Set<string>([
  LEAD_PERMISSIONS.view,
  LEAD_PERMISSIONS.edit,
  LEAD_PERMISSIONS.qualify,
]);

async function inboundLeadPlatform(client: SupabaseClient) {
  const { createLoginAppLeadPlatformServices } = await import(
    "@login-app/lib/lead-platform/lead-platform-factory.js"
  );
  return createLoginAppLeadPlatformServices(client);
}

function isCustomerMessage(messageType: unknown): boolean {
  const type = String(messageType ?? "").toLowerCase();
  if (!type) return true;
  return type.includes("customer") || type.includes("inbound") || type === "user" || type === "incoming";
}

export function createConversationSalesQualificationTurn(client: SupabaseClient) {
  const gate = createSupabaseInboundAiGatePort(client, {
    getConversation: async (companyId, conversationId) => {
      const { data, error } = await client
        .from("conversations")
        .select("assigned_user_id, state")
        .eq("id", conversationId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error || !data) return null;
      return {
        assignedUserId: data.assigned_user_id ? String(data.assigned_user_id) : null,
        state: data.state ? String(data.state) : null,
      };
    },
  });

  return async function afterCustomerTurn(input: {
    companyId: string;
    conversationId: string;
    messageText: string;
    correlationId?: string;
    pageContext?: Record<string, unknown> | null;
    actorUserId: string | null;
  }): Promise<void> {
    try {
      const decision = await gate.evaluate({
        companyId: input.companyId,
        conversationId: input.conversationId,
      });
      let publicWebChatConversation = false;
      try {
        publicWebChatConversation = await conversationIsPublicWebWidget(
          client,
          input.companyId,
          input.conversationId,
        );
      } catch {
        publicWebChatConversation = true;
      }
      await qualifyOpenLeadFromCustomerTurn({
        ...input,
        publicWebChatConversation,
        gateAllowsAutomatedReply: decision.allowAutomatedReply,
        findLeadId: async () => {
          const platform = await inboundLeadPlatform(client);
          const ctx: LeadServiceContext = {
            userId: input.actorUserId,
            companyId: input.companyId,
            isSuperAdmin: false,
            hasPermission: (code) => SALES_AI_PERMISSIONS.has(code),
          };
          const found = await platform.queries.getLeadByConversation(ctx, {
            companyId: input.companyId,
            conversationId: input.conversationId,
          });
          return found.lead?.id ?? null;
        },
        loadCustomerTexts: async () => {
          const { data: conversation, error: conversationError } = await client
            .from("conversations")
            .select("id")
            .eq("id", input.conversationId)
            .eq("company_id", input.companyId)
            .maybeSingle();
          if (conversationError || !conversation) return [];
          const { data, error } = await client
            .from("conversation_messages")
            .select("content, message_type")
            .eq("conversation_id", input.conversationId)
            .order("created_at", { ascending: false })
            .limit(20);
          if (error || !data) return [];
          return data
            .filter((row) => isCustomerMessage(row.message_type))
            .map((row) => String(row.content ?? ""))
            .reverse();
        },
        apply: async ({ leadId, messageId, texts }) => {
          const platform = await inboundLeadPlatform(client);
          const ctx: LeadServiceContext = {
            userId: input.actorUserId,
            companyId: input.companyId,
            isSuperAdmin: false,
            hasPermission: (code) => SALES_AI_PERMISSIONS.has(code),
          };
          try {
            await preserveTrustedConversationCustomer(client, {
              companyId: input.companyId,
              conversationId: input.conversationId,
              leadId,
              updateLeadCustomer: async (customerId) => {
                await platform.commands.updateLead(ctx, {
                  companyId: input.companyId,
                  leadId,
                  customerId,
                });
              },
            });
          } catch {
            // Linking an existing customer must not skip qualification.
          }
          const result = await platform.commands.applyConversationQualification(ctx, {
            companyId: input.companyId,
            leadId,
            messageId,
            texts,
          });
          logger.info(
            {
              event: "sales.qualification.conversation",
              companyId: input.companyId,
              leadId,
              outcome: result.outcome,
              reason: result.reason,
              qualificationApplied: result.qualificationApplied,
              duplicate: result.duplicate,
            },
            "conversation sales qualification",
          );
        },
      });
    } catch (error) {
      logger.warn(
        {
          event: "sales.qualification.conversation_failed",
          companyId: input.companyId,
          conversationId: input.conversationId,
          err:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : error && typeof error === "object"
                ? {
                    name: "name" in error ? String((error as { name?: unknown }).name) : null,
                    message: "message" in error ? String((error as { message?: unknown }).message) : null,
                    code: "code" in error ? String((error as { code?: unknown }).code) : null,
                  }
                : String(error),
        },
        "conversation sales qualification skipped",
      );
    }
  };
}
