/**
 * Compact Email lifecycle from existing conversation/message/ticket facts only.
 * Missing events are omitted — never fabricated.
 */

export type EmailLifecycleEventId =
  | "received"
  | "classified"
  | "assigned"
  | "manual_review"
  | "ticket"
  | "drafted"
  | "sent"
  | "delivered"
  | "failed";

export type EmailLifecycleEvent = {
  id: EmailLifecycleEventId;
  detail?: string;
};

export type EmailRoutingTicketMeta = {
  status?: string | null;
  ticketNumber?: string | null;
};

export function readEmailRoutingMeta(metadata: Record<string, unknown> | null | undefined): {
  category: string | null;
  confidence: number | null;
  targetId: string | null;
  targetType: string | null;
  configurationRequired: boolean | null;
  ticket: EmailRoutingTicketMeta | null;
} {
  const classification =
    metadata && typeof metadata.emailRoutingClassification === "object"
      ? (metadata.emailRoutingClassification as Record<string, unknown>)
      : null;
  const decision =
    metadata && typeof metadata.emailRoutingDecision === "object"
      ? (metadata.emailRoutingDecision as Record<string, unknown>)
      : null;
  const ticket =
    metadata && typeof metadata.emailRoutingTicket === "object"
      ? (metadata.emailRoutingTicket as Record<string, unknown>)
      : null;

  const confidence =
    typeof classification?.confidence === "number" ? classification.confidence : null;
  const category =
    typeof classification?.category === "string" ? classification.category : null;
  const targetId = typeof decision?.targetId === "string" ? decision.targetId : null;
  const targetType = typeof decision?.targetType === "string" ? decision.targetType : null;
  const configurationRequired =
    typeof decision?.configurationRequired === "boolean" ? decision.configurationRequired : null;

  return {
    category,
    confidence,
    targetId,
    targetType,
    configurationRequired,
    ticket: ticket
      ? {
          status: typeof ticket.status === "string" ? ticket.status : null,
          ticketNumber: typeof ticket.ticketNumber === "string" ? ticket.ticketNumber : null,
        }
      : null,
  };
}

/**
 * Resolve a human-readable routed department/team label for lifecycle + list chips.
 * Prefer conversation.department_id (ownership stamp), then routing target when type=department.
 */
export function resolveEmailRoutedDepartmentLabel(input: {
  departmentId?: string | null;
  routing: ReturnType<typeof readEmailRoutingMeta>;
  departmentsById: ReadonlyMap<string, string>;
}): string | null {
  const fromOwnership = input.departmentId?.trim() || null;
  const fromRouting =
    input.routing.targetType === "department" && input.routing.targetId?.trim()
      ? input.routing.targetId.trim()
      : null;
  const id = fromOwnership || fromRouting;
  if (!id) return null;
  const name = input.departmentsById.get(id)?.trim();
  return name || null;
}

export function deriveEmailThreadLifecycle(input: {
  hasIncoming: boolean;
  hasOutgoing: boolean;
  hasDraft: boolean;
  assignedUserId?: string | null;
  /** Display name for routed department / team when known. */
  routedTargetLabel?: string | null;
  latestOutgoingStatus?: string | null;
  routing: ReturnType<typeof readEmailRoutingMeta>;
  ticketNumber?: string | null;
}): EmailLifecycleEvent[] {
  const events: EmailLifecycleEvent[] = [];
  if (input.hasIncoming) events.push({ id: "received" });
  if (input.routing.category) {
    const pct =
      input.routing.confidence != null
        ? `${Math.round(input.routing.confidence * 100)}%`
        : undefined;
    events.push({
      id: "classified",
      detail: pct ? `${input.routing.category} · ${pct}` : input.routing.category,
    });
  }
  if (input.assignedUserId || input.routing.targetId) {
    const label = input.routedTargetLabel?.trim();
    events.push({
      id: "assigned",
      detail: label || undefined,
    });
  } else if (input.routing.configurationRequired === true) {
    events.push({ id: "manual_review" });
  }
  const ticketNumber = input.ticketNumber || input.routing.ticket?.ticketNumber;
  if (ticketNumber) {
    const reused = input.routing.ticket?.status === "reused";
    events.push({
      id: "ticket",
      detail: reused ? `reused:${ticketNumber}` : ticketNumber,
    });
  }
  if (input.hasDraft) events.push({ id: "drafted" });
  if (input.hasOutgoing) events.push({ id: "sent" });
  const status = input.latestOutgoingStatus;
  if (status === "delivered" || status === "read") events.push({ id: "delivered" });
  if (status === "failed") events.push({ id: "failed" });
  return events;
}
