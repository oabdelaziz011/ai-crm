import type { CustomerServicePort } from "@workspace/automation-platform";
import type { LeadCommandService, LeadReadPort, LeadServiceContext } from "@workspace/lead-platform";

export type ConversationIdentitySnapshot = {
  conversationId: string;
  customerId?: string | null;
  leadId?: string | null;
  email?: string | null;
  phone?: string | null;
  displayName?: string | null;
};

export type IdentityPlatformPorts = {
  customers: CustomerServicePort;
  leadReads: LeadReadPort;
  leadCommands: LeadCommandService;
  loadConversation?: (input: {
    companyId: string;
    conversationId: string;
  }) => Promise<ConversationIdentitySnapshot | null>;
  linkConversationToLead?: (input: {
    companyId: string;
    conversationId: string;
    leadId: string;
  }) => Promise<void>;
  linkConversationToCustomer?: (input: {
    companyId: string;
    conversationId: string;
    customerId: string;
  }) => Promise<void>;
};

export type { LeadServiceContext };
