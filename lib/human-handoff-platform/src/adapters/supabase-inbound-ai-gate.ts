import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseHandoffRepository } from "../repositories/supabase-handoff-repositories.js";
import {
  createInboundAiGateEvaluator,
  type InboundAiGateConversationSnapshot,
  type InboundAiGateDecision,
} from "../services/inbound-ai-gate.js";

export type SupabaseInboundAiGatePort = {
  evaluate(input: {
    companyId: string;
    conversationId: string;
  }): Promise<InboundAiGateDecision>;
};

/**
 * Service-role safe inbound automation gate for channel webhooks.
 * Reads handoff ownership (+ optional conversation fallback) without RBAC.
 */
export function createSupabaseInboundAiGatePort(
  client: SupabaseClient,
  options?: {
    getConversation?: (
      companyId: string,
      conversationId: string,
    ) => Promise<InboundAiGateConversationSnapshot | null>;
  },
): SupabaseInboundAiGatePort {
  const handoff = createSupabaseHandoffRepository(client);
  const evaluate = createInboundAiGateEvaluator({
    getOwnership: async (companyId, conversationId) => {
      const row = await handoff.getOwnership(companyId, conversationId);
      if (!row) return null;
      return {
        ownerType: row.ownerType,
        isPaused: row.isPaused,
        lifecycleState: row.lifecycleState,
        assignedUserId: row.assignedUserId,
      };
    },
    getConversation: options?.getConversation,
  });

  return { evaluate };
}
