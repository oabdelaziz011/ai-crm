import type { EmailRoutingCategory } from "./categories.js";
import type { EmailRoutingDecision, EmailRoutingTargetType } from "./email-routing-engine-contract.js";

export type EmailRoutingClassificationSnapshot = {
  category: EmailRoutingCategory | string;
  confidence: number;
  subcategory?: string | null;
  reason: string;
  source: string;
};

export type EmailRoutingTicketRef = {
  id: string;
  ticketNumber?: string;
  assignedUserId?: string | null;
  /** Existing ticket customer link when returned by listByConversation. */
  customerId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Existing ticket command/query surface used by AI Email Routing (Sprint 5).
 * Implemented by adapters over TicketCommandService / TicketQueryService.
 */
export type EmailRoutingTicketPort = {
  listByConversation(input: {
    companyId: string;
    conversationId: string;
  }): Promise<EmailRoutingTicketRef[]>;

  createTicket(input: {
    companyId: string;
    subject: string;
    description?: string;
    conversationId: string;
    /** Trusted inbound customer only — never model/browser-supplied. */
    customerId?: string | null;
    metadata: Record<string, unknown>;
  }): Promise<EmailRoutingTicketRef>;

  /**
   * Assigns a company-scoped employee/user via the existing ticket assignment path.
   * Must validate assignee membership inside the ticket platform assignee resolver.
   */
  assignEmployee(input: {
    companyId: string;
    ticketId: string;
    assigneeUserId: string;
  }): Promise<EmailRoutingTicketRef>;

  /**
   * Mirrors employee routing onto conversations.assigned_user_id (canonical email assignee).
   * Must stay company-scoped. Optional for tests that only cover ticket assignment.
   */
  assignConversationEmployee?(input: {
    companyId: string;
    conversationId: string;
    assigneeUserId: string;
  }): Promise<void>;

  /**
   * Fail-closed company scope check for trustedCustomerId.
   * Returns true only when the customer row belongs to companyId.
   */
  verifyCustomerCompanyScope?(input: {
    companyId: string;
    customerId: string;
  }): Promise<boolean>;
};

export type EmailRoutingTicketActionInput = {
  companyId: string;
  conversationId: string;
  inboundEventId: string;
  /**
   * Server-resolved trusted channel customer only.
   * Must not be taken from model output, browser, or request body.
   */
  trustedCustomerId?: string | null;
  /** Email subject; used as ticket subject when creating. */
  subject?: string | null;
  /** Short body preview only — never persist full email body repeatedly. */
  bodyPreview?: string | null;
  classification: EmailRoutingClassificationSnapshot;
  decision: Pick<
    EmailRoutingDecision,
    "targetType" | "targetId" | "category" | "confidence" | "reason" | "source" | "configurationRequired"
  >;
};

export type EmailRoutingTicketActionResult =
  | {
      status: "skipped";
      reason:
        | "routing_unresolved"
        | "missing_conversation"
        | "missing_company"
        | "trusted_customer_company_mismatch"
        | "ticket_customer_conflict";
      ticketId: null;
      assignedUserId: null;
    }
  | {
      status: "reused" | "created";
      reason: string;
      ticketId: string;
      ticketNumber?: string;
      assignedUserId: string | null;
      targetType: EmailRoutingTargetType;
      targetId: string | null;
      customerId?: string | null;
    };

export function isEmailRoutingDecisionResolvable(
  decision: EmailRoutingTicketActionInput["decision"],
): boolean {
  if (decision.configurationRequired) return false;
  if (decision.targetType === "unresolved") return false;
  const targetId = typeof decision.targetId === "string" ? decision.targetId.trim() : "";
  return targetId.length > 0;
}

function normalizeTrustedCustomerId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildTicketMetadata(input: EmailRoutingTicketActionInput): Record<string, unknown> {
  return {
    source: "email",
    channelKey: "email",
    emailRoutingInboundEventId: input.inboundEventId,
    emailRoutingClassification: {
      category: input.classification.category,
      confidence: input.classification.confidence,
      subcategory: input.classification.subcategory ?? null,
      reason: input.classification.reason,
      source: input.classification.source,
    },
    emailRoutingDecision: {
      targetType: input.decision.targetType,
      targetId: input.decision.targetId,
      category: input.decision.category,
      confidence: input.decision.confidence,
      reason: input.decision.reason,
      source: input.decision.source,
      configurationRequired: input.decision.configurationRequired,
    },
  };
}

function findExistingForInbound(tickets: EmailRoutingTicketRef[]): EmailRoutingTicketRef | null {
  if (tickets.length === 0) return null;
  // Prefer a ticket already tagged as email-routing when metadata is available.
  for (const ticket of tickets) {
    const meta = ticket.metadata ?? {};
    if (meta.source === "email" && meta.emailRoutingDecision) return ticket;
  }
  // Conversation-scoped reuse: existing ticket platform links tickets via conversationId.
  return tickets[0] ?? null;
}

async function syncConversationEmployeeAssignee(
  tickets: EmailRoutingTicketPort,
  input: {
    companyId: string;
    conversationId: string;
    assigneeUserId: string;
  },
): Promise<void> {
  if (!tickets.assignConversationEmployee) return;
  await tickets.assignConversationEmployee({
    companyId: input.companyId,
    conversationId: input.conversationId,
    assigneeUserId: input.assigneeUserId,
  });
}

async function resolveTrustedCustomerForCreate(
  tickets: EmailRoutingTicketPort,
  companyId: string,
  trustedCustomerId: string | null,
): Promise<
  | { ok: true; customerId: string | null }
  | { ok: false; reason: "trusted_customer_company_mismatch" }
> {
  if (!trustedCustomerId) {
    // Missing trusted identity: do not guess / fuzzy-match. Create customerless ticket.
    return { ok: true, customerId: null };
  }
  if (tickets.verifyCustomerCompanyScope) {
    const inScope = await tickets.verifyCustomerCompanyScope({
      companyId,
      customerId: trustedCustomerId,
    });
    if (!inScope) {
      return { ok: false, reason: "trusted_customer_company_mismatch" };
    }
  }
  return { ok: true, customerId: trustedCustomerId };
}

/**
 * Apply a Sprint 4 routing decision to the existing ticket platform.
 * Does not call an LLM. Does not invent targets.
 * customer_id is derived only from server-side trustedCustomerId.
 */
export async function applyEmailRoutingTicketAction(
  tickets: EmailRoutingTicketPort,
  input: EmailRoutingTicketActionInput,
): Promise<EmailRoutingTicketActionResult> {
  const companyId = input.companyId?.trim();
  const conversationId = input.conversationId?.trim();
  if (!companyId) {
    return {
      status: "skipped",
      reason: "missing_company",
      ticketId: null,
      assignedUserId: null,
    };
  }
  if (!conversationId) {
    return {
      status: "skipped",
      reason: "missing_conversation",
      ticketId: null,
      assignedUserId: null,
    };
  }

  if (!isEmailRoutingDecisionResolvable(input.decision)) {
    return {
      status: "skipped",
      reason: "routing_unresolved",
      ticketId: null,
      assignedUserId: null,
    };
  }

  const trustedCustomerId = normalizeTrustedCustomerId(input.trustedCustomerId);

  const existingList = await tickets.listByConversation({ companyId, conversationId });
  const existing = findExistingForInbound(existingList);
  if (existing) {
    const existingCustomerId = normalizeTrustedCustomerId(existing.customerId ?? null);

    // Do not reuse a ticket already linked to a different customer.
    if (existingCustomerId && trustedCustomerId && existingCustomerId !== trustedCustomerId) {
      return {
        status: "skipped",
        reason: "ticket_customer_conflict",
        ticketId: null,
        assignedUserId: null,
      };
    }

    // customer_id = null on existing ticket: no safe TicketCommandService update path
    // under tickets.view/create/assign only — leave unchanged (do not invent a DB update).

    let assignedUserId = existing.assignedUserId ?? null;
    if (input.decision.targetType === "employee" && input.decision.targetId && !assignedUserId) {
      const assigned = await tickets.assignEmployee({
        companyId,
        ticketId: existing.id,
        assigneeUserId: input.decision.targetId.trim(),
      });
      assignedUserId = assigned.assignedUserId ?? input.decision.targetId.trim();
    }
    if (
      input.decision.targetType === "employee" &&
      assignedUserId &&
      typeof assignedUserId === "string" &&
      assignedUserId.trim()
    ) {
      await syncConversationEmployeeAssignee(tickets, {
        companyId,
        conversationId,
        assigneeUserId: assignedUserId.trim(),
      });
    }
    return {
      status: "reused",
      reason: "Existing conversation ticket reused (idempotent)",
      ticketId: existing.id,
      ticketNumber: existing.ticketNumber,
      assignedUserId,
      targetType: input.decision.targetType,
      targetId: input.decision.targetId,
      customerId: existingCustomerId,
    };
  }

  const trusted = await resolveTrustedCustomerForCreate(tickets, companyId, trustedCustomerId);
  if (!trusted.ok) {
    return {
      status: "skipped",
      reason: trusted.reason,
      ticketId: null,
      assignedUserId: null,
    };
  }

  const subject =
    (typeof input.subject === "string" && input.subject.trim()) ||
    `Email: ${input.decision.category}`;
  const description =
    typeof input.bodyPreview === "string" && input.bodyPreview.trim()
      ? input.bodyPreview.trim().slice(0, 500)
      : undefined;

  const created = await tickets.createTicket({
    companyId,
    conversationId,
    subject: subject.slice(0, 240),
    description,
    customerId: trusted.customerId,
    metadata: buildTicketMetadata(input),
  });

  let assignedUserId: string | null = null;
  // Only employee targets map to TicketCommandService.assignTicket.
  // department/team/queue are retained on metadata until a team-assignment model exists.
  if (input.decision.targetType === "employee" && input.decision.targetId) {
    const assigned = await tickets.assignEmployee({
      companyId,
      ticketId: created.id,
      assigneeUserId: input.decision.targetId.trim(),
    });
    assignedUserId = assigned.assignedUserId ?? input.decision.targetId.trim();
    await syncConversationEmployeeAssignee(tickets, {
      companyId,
      conversationId,
      assigneeUserId: assignedUserId.trim(),
    });
  }

  return {
    status: "created",
    reason:
      input.decision.targetType === "employee"
        ? "Ticket created and assigned via existing ticket assignment"
        : `Ticket created unassigned; ${input.decision.targetType} target retained in metadata`,
    ticketId: created.id,
    ticketNumber: created.ticketNumber,
    assignedUserId,
    targetType: input.decision.targetType,
    targetId: input.decision.targetId,
    customerId: trusted.customerId,
  };
}
