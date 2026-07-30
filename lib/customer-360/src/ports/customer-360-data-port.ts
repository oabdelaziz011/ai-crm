import type { Customer360Dto } from "../dto/customer-360-dto.js";

export type Customer360AccessContext = {
  companyId: string;
  actorUserId: string;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type Customer360FetchInput = {
  companyId: string;
  customerId: string;
  conversationId?: string;
  channelType?: string | null;
  recentMessages?: Array<{ role: string; content: string; createdAt: string }>;
};

export type Customer360RawBundle = {
  profile: Customer360Dto["customer"];
  previousConversations: Customer360Dto["conversation"]["previous"];
  currentConversation?: Customer360Dto["conversation"]["current"];
  opportunities: Customer360Dto["sales"]["opportunities"];
  bookings: Customer360Dto["bookings"];
  invoices: Customer360Dto["invoices"];
  support: Customer360Dto["support"];
};

export interface Customer360DataPort {
  resolveCustomerId(input: {
    companyId: string;
    actorUserId: string;
    conversationId?: string;
    customerId?: string | null;
    senderEmail?: string | null;
    senderPhone?: string | null;
  }): Promise<string | null>;

  fetchBundle(
    access: Customer360AccessContext,
    input: Customer360FetchInput,
  ): Promise<Customer360RawBundle | null>;
}
