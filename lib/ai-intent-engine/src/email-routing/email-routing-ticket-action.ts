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
};

export type EmailRoutingTicketActionInput = {
  companyId: string;
  conversationId: string;
  inboundEventId: string;
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
      reason: "routing_unresolved" | "missing_conversation" | "missing_company";
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
    };

export function isEmailRoutingDecisionResolvable(
  decision: EmailRoutingTicketActionInput["decision"],
): boolean {
  if (decision.configurationRequired) return false;
  if (decision.targetType === "unresolved") return false;
  const targetId = typeof decision.targetId === "string" ? decision.targetId.trim() : "";
  return targetId.length > 0;
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

/**
 * Apply a Sprint 4 routing decision to the existing ticket platform.
 * Does not call an LLM. Does not invent targets.
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

  const existingList = await tickets.listByConversation({ companyId, conversationId });
  const existing = findExistingForInbound(existingList);
  if (existing) {
    let assignedUserId = existing.assignedUserId ?? null;
    if (input.decision.targetType === "employee" && input.decision.targetId && !assignedUserId) {
      const assigned = await tickets.assignEmployee({
        companyId,
        ticketId: existing.id,
        assigneeUserId: input.decision.targetId.trim(),
      });
      assignedUserId = assigned.assignedUserId ?? input.decision.targetId.trim();
    }
    return {
      status: "reused",
      reason: "Existing conversation ticket reused (idempotent)",
      ticketId: existing.id,
      ticketNumber: existing.ticketNumber,
      assignedUserId,
      targetType: input.decision.targetType,
      targetId: input.decision.targetId,
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
  };
}
