export type LinkConversationCustomerInput = {
  companyId: string;
  conversationId: string;
  customerId: string;
  automationSessionId?: string | null;
};

export type ConversationCustomerLinkPort = {
  linkCustomerToConversation(input: LinkConversationCustomerInput): Promise<void>;
};

export class NoopConversationCustomerLinkPort implements ConversationCustomerLinkPort {
  async linkCustomerToConversation(): Promise<void> {
    /* optional in tests */
  }
}
