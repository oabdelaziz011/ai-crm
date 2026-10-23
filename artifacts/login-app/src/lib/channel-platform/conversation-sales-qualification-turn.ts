/**
 * Same qualification service as the API channel runtime.
 * Public website chat (stored widget provider or page flag) and human-owned
 * conversations do not qualify. A lookup error skips qualification.
 * Dashboard actions that never call ChannelRuntimePort.execute do not qualify here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseInboundAiGatePort } from "@workspace/human-handoff-platform";
import {
  conversationIsPublicWebWidget,
  LEAD_PERMISSIONS,
  preserveTrustedConversationCustomer,
  qualifyOpenLeadFromCustomerTurn,
  type LeadServiceContext,
} from "@workspace/lead-platform";
import { createLoginAppLeadPlatformServices } from "@/lib/lead-platform/lead-platform-factory.js";

const SALES_AI_PERMISSIONS = new Set<string>([
  LEAD_PERMISSIONS.view,
  LEAD_PERMISSIONS.edit,
  LEAD_PERMISSIONS.qualify,
]);

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
          const platform = createLoginAppLeadPlatformServices(client);
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
          const platform = createLoginAppLeadPlatformServices(client);
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
          await platform.commands.applyConversationQualification(ctx, {
            companyId: input.companyId,
            leadId,
            messageId,
            texts,
          });
        },
      });
    } catch (error) {
      console.warn("[conversation-sales-qualification]", {
        companyId: input.companyId,
        conversationId: input.conversationId,
        err: error instanceof Error ? error.message : "unknown",
      });
    }
  };
}
