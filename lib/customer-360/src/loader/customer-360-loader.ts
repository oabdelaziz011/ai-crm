import type { Customer360Dto } from "../dto/customer-360-dto.js";
import { Customer360Aggregator } from "../aggregator/customer-360-aggregator.js";
import type { Customer360AccessContext, Customer360DataPort } from "../ports/customer-360-data-port.js";

export type Customer360LoaderInput = {
  companyId: string;
  conversationId: string;
  customerId?: string | null;
  channelType?: string | null;
  senderEmail?: string | null;
  senderPhone?: string | null;
  recentMessages?: Array<{ role: string; content: string; createdAt: string }>;
};

export type Customer360LoaderContext = Customer360AccessContext;

export class Customer360Loader {
  constructor(
    private readonly dataPort: Customer360DataPort,
    private readonly aggregator: Customer360Aggregator,
  ) {}

  async load(ctx: Customer360LoaderContext, input: Customer360LoaderInput): Promise<Customer360Dto | null> {
    const customerId = await this.dataPort.resolveCustomerId({
      companyId: input.companyId,
      actorUserId: ctx.actorUserId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      senderEmail: input.senderEmail,
      senderPhone: input.senderPhone,
    });

    if (!customerId) return null;

    return this.aggregator.build(ctx, {
      companyId: input.companyId,
      customerId,
      conversationId: input.conversationId,
      channelType: input.channelType,
      recentMessages: input.recentMessages,
    });
  }
}

export function createCustomer360Loader(dataPort: Customer360DataPort): Customer360Loader {
  return new Customer360Loader(dataPort, new Customer360Aggregator({ dataPort }));
}
