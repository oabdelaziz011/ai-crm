export type ToolCustomerRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export type ToolFindCustomerResult =
  | { status: "not_found"; count: 0 }
  | { status: "found"; count: 1; customer: ToolCustomerRecord }
  | { status: "duplicate"; count: number };

/** Minimal CRM port injected by login-app — keeps ai-tool-router free of automation-platform coupling. */
export type ToolCustomerServicePort = {
  findCustomer(input: {
    companyId: string;
    userId: string;
    lookupBy: "phone" | "email" | "phone_e164";
    lookupValue: string;
  }): Promise<ToolFindCustomerResult>;
  createCustomer(input: {
    companyId: string;
    userId: string;
    name: string;
    phone: string;
    email?: string | null;
    phoneIdentity?: {
      phone_e164: string | null;
      phone_country_iso: string | null;
      phone_region_source: "explicit" | "e164" | "channel" | "import" | "unresolved" | null;
      phone_national: string | null;
    } | null;
  }): Promise<{ customer: ToolCustomerRecord }>;
  updateCustomerName?(input: {
    companyId: string;
    userId: string;
    customerId: string;
    name: string;
  }): Promise<{ customer: ToolCustomerRecord }>;
  linkConversationCustomer?(input: {
    conversationId: string;
    customerId: string;
    /** When set, stamps trustedChannelCustomerId + known status on conversation metadata. */
    customerName?: string | null;
    stampTrustedIdentity?: boolean;
  }): Promise<void>;
  /** WhatsApp inbound sender (externalThreadId / senderExternalId) for the conversation. */
  getConversationWhatsAppSender?(input: {
    conversationId: string;
  }): Promise<string | null>;
};
