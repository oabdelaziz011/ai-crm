import type {
  CreateLeadForUnknownInput,
  IdentityResolutionInput,
  ResolvedIdentity,
} from "../types/identity-types.js";
import type { IdentityPlatformPorts, LeadServiceContext } from "../ports/identity-platform-ports.js";

function buildLeadContext(input: { companyId: string; actorUserId: string }): LeadServiceContext {
  return {
    userId: input.actorUserId,
    companyId: input.companyId,
    isSuperAdmin: false,
    hasPermission: () => true,
  };
}

export class IdentityResolutionService {
  constructor(private readonly ports: IdentityPlatformPorts) {}

  async resolve(input: IdentityResolutionInput): Promise<ResolvedIdentity> {
    if (input.customerId?.trim()) {
      const found = await this.ports.customers.findCustomer({
        companyId: input.companyId,
        userId: input.actorUserId,
        lookupBy: "customer_id",
        lookupValue: input.customerId.trim(),
      });
      if (found.status === "found") {
        return {
          kind: "customer",
          customerId: found.customer.id,
          displayName: found.customer.name,
          email: found.customer.email ?? null,
          phone: found.customer.phone ?? null,
        };
      }
    }

    if (input.leadId?.trim()) {
      const lead = await this.ports.leadReads.getLead(buildLeadContext(input), {
        companyId: input.companyId,
        leadId: input.leadId.trim(),
      });
      if (lead.lead) {
        return {
          kind: "lead",
          leadId: lead.lead.id,
          displayName: lead.lead.contactName || lead.lead.title,
          email: lead.lead.email,
          phone: lead.lead.phone,
        };
      }
    }

    if (input.conversationId?.trim() && this.ports.loadConversation) {
      const conversation = await this.ports.loadConversation({
        companyId: input.companyId,
        conversationId: input.conversationId.trim(),
      });
      if (conversation?.customerId) {
        const found = await this.ports.customers.findCustomer({
          companyId: input.companyId,
          userId: input.actorUserId,
          lookupBy: "customer_id",
          lookupValue: conversation.customerId,
        });
        if (found.status === "found") {
          return {
            kind: "customer",
            customerId: found.customer.id,
            displayName: found.customer.name,
            email: found.customer.email ?? null,
            phone: found.customer.phone ?? null,
          };
        }
      }
      if (conversation?.leadId) {
        const lead = await this.ports.leadReads.getLead(buildLeadContext(input), {
          companyId: input.companyId,
          leadId: conversation.leadId,
        });
        if (lead.lead) {
          return {
            kind: "lead",
            leadId: lead.lead.id,
            displayName: lead.lead.contactName || lead.lead.title,
            email: lead.lead.email,
            phone: lead.lead.phone,
          };
        }
      }
    }

    const email = input.email?.trim().toLowerCase();
    if (email) {
      const customer = await this.ports.customers.findCustomer({
        companyId: input.companyId,
        userId: input.actorUserId,
        lookupBy: "email",
        lookupValue: email,
      });
      if (customer.status === "found") {
        return {
          kind: "customer",
          customerId: customer.customer.id,
          displayName: customer.customer.name,
          email: customer.customer.email ?? null,
          phone: customer.customer.phone ?? null,
        };
      }
      const leads = await this.ports.leadReads.searchLeads(buildLeadContext(input), {
        companyId: input.companyId,
        query: email,
        limit: 1,
        offset: 0,
      });
      if (leads.leads[0]) {
        const lead = leads.leads[0];
        return {
          kind: "lead",
          leadId: lead.id,
          displayName: lead.contactName || lead.title,
          email: lead.email,
          phone: lead.phone,
        };
      }
    }

    const phone = input.phone?.trim();
    if (phone) {
      const customer = await this.ports.customers.findCustomer({
        companyId: input.companyId,
        userId: input.actorUserId,
        lookupBy: "phone",
        lookupValue: phone,
      });
      if (customer.status === "found") {
        return {
          kind: "customer",
          customerId: customer.customer.id,
          displayName: customer.customer.name,
          email: customer.customer.email ?? null,
          phone: customer.customer.phone ?? null,
        };
      }
      const leads = await this.ports.leadReads.searchLeads(buildLeadContext(input), {
        companyId: input.companyId,
        query: phone,
        limit: 1,
        offset: 0,
      });
      if (leads.leads[0]) {
        const lead = leads.leads[0];
        return {
          kind: "lead",
          leadId: lead.id,
          displayName: lead.contactName || lead.title,
          email: lead.email,
          phone: lead.phone,
        };
      }
    }

    return { kind: "unknown" };
  }

  async createLeadForUnknown(input: CreateLeadForUnknownInput): Promise<ResolvedIdentity> {
    const ctx = buildLeadContext(input);
    const result = await this.ports.leadCommands.createLead(ctx, {
      companyId: input.companyId,
      title: input.title,
      contactName: input.contactName,
      email: input.email ?? undefined,
      phone: input.phone ?? undefined,
      companyName: input.companyName ?? undefined,
      conversationId: input.conversationId,
      aiSummary: input.aiSummary,
      metadata: input.metadata,
    });

    if (this.ports.linkConversationToLead) {
      await this.ports.linkConversationToLead({
        companyId: input.companyId,
        conversationId: input.conversationId,
        leadId: result.lead.id,
      });
    }

    return {
      kind: "lead",
      leadId: result.lead.id,
      displayName: result.lead.contactName || result.lead.title,
      email: result.lead.email,
      phone: result.lead.phone,
    };
  }

  async convertLeadToCustomer(input: {
    companyId: string;
    actorUserId: string;
    leadId: string;
    conversationId?: string;
  }): Promise<ResolvedIdentity> {
    const ctx = buildLeadContext(input);
    const result = await this.ports.leadCommands.convertLead(ctx, {
      companyId: input.companyId,
      leadId: input.leadId,
    });

    if (input.conversationId && this.ports.linkConversationToCustomer) {
      await this.ports.linkConversationToCustomer({
        companyId: input.companyId,
        conversationId: input.conversationId,
        customerId: result.customerId,
      });
    }

    return {
      kind: "customer",
      customerId: result.customerId,
      leadId: result.lead.id,
      displayName: result.lead.contactName || result.lead.title,
      email: result.lead.email,
      phone: result.lead.phone,
    };
  }
}

export class ConversationIdentityResolver {
  constructor(private readonly identity: IdentityResolutionService) {}

  resolveConversationIdentity(input: IdentityResolutionInput): Promise<ResolvedIdentity> {
    return this.identity.resolve(input);
  }

  ensureLeadForUnknownConversation(input: CreateLeadForUnknownInput): Promise<ResolvedIdentity> {
    return this.identity.createLeadForUnknown(input);
  }
}
