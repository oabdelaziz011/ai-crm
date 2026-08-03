import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseCustomerServicePort } from "@workspace/automation-platform";
import {
  ConversationIdentityResolver,
  IdentityResolutionService,
  type IdentityPlatformPorts,
} from "@workspace/identity-platform";
import { linkCustomerToConversation } from "@/lib/conversation-lifecycle/integration/conversation-customer-link";
import { getLoginAppLeadPlatformServices } from "@/lib/lead-platform/lead-read-port-adapter";
import { linkLeadToConversation } from "./conversation-lead-link.js";

function createConversationLoader(client: SupabaseClient): IdentityPlatformPorts["loadConversation"] {
  return async ({ companyId, conversationId }) => {
    const { data, error } = await client
      .from("conversations")
      .select("id, customer_id, lead_id, metadata")
      .eq("company_id", companyId)
      .eq("id", conversationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const metadata = (data.metadata as Record<string, unknown> | null) ?? null;
    return {
      conversationId: String(data.id),
      customerId: data.customer_id ? String(data.customer_id) : null,
      leadId: data.lead_id
        ? String(data.lead_id)
        : typeof metadata?.leadId === "string"
          ? metadata.leadId
          : null,
      email: typeof metadata?.email === "string" ? metadata.email : null,
      phone: typeof metadata?.phone === "string" ? metadata.phone : null,
      displayName: typeof metadata?.displayName === "string" ? metadata.displayName : null,
    };
  };
}

export function createLoginAppIdentityPlatform(client: SupabaseClient) {
  const leadPlatform = getLoginAppLeadPlatformServices(client);
  const ports: IdentityPlatformPorts = {
    customers: createSupabaseCustomerServicePort(client),
    leadReads: leadPlatform.reads,
    leadCommands: leadPlatform.commands,
    loadConversation: createConversationLoader(client),
    linkConversationToLead: async (input) => {
      await linkLeadToConversation(client, input);
    },
    linkConversationToCustomer: async (input) => {
      await linkCustomerToConversation(input);
    },
  };

  const identity = new IdentityResolutionService(ports);
  return {
    identity,
    conversations: new ConversationIdentityResolver(identity),
  };
}
