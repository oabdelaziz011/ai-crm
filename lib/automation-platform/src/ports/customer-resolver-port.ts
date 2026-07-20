import type { AutomationChannel } from "../constants.js";
import type { NormalizedInboundMessage } from "../types.js";

export type CustomerLookupInput = {
  companyId: string;
  channel: AutomationChannel;
  externalUserId: string;
};

export interface CustomerResolverPort {
  resolveCustomer(input: CustomerLookupInput): Promise<string | null>;
}

export class InMemoryCustomerResolver implements CustomerResolverPort {
  constructor(private readonly customers = new Map<string, string>()) {}

  seed(companyId: string, channel: AutomationChannel, externalUserId: string, customerId: string) {
    this.customers.set(`${companyId}:${channel}:${externalUserId}`, customerId);
  }

  async resolveCustomer(input: CustomerLookupInput): Promise<string | null> {
    return this.customers.get(`${input.companyId}:${input.channel}:${input.externalUserId}`) ?? null;
  }
}
