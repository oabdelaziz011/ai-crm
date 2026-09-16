/**
 * Pure Ticket 360 tab helpers — mapping/scoping only (no I/O).
 */

export type Ticket360MessageRow = {
  id: string;
  conversationId: string;
  sequenceNumber: number;
  messageType: string;
  content: string;
  contentType: string;
  status: string;
  createdAt: string;
  createdBy: string | null;
  attachmentType: string | null;
  attachmentUrl: string | null;
  isInternalNote: boolean;
};

export type Ticket360AuditLike = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  userId: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

/** Authoritative audit query scope for a single ticket (never global latest-N). */
export function buildTicketAuditQueryScope(companyId: string, ticketId: string) {
  return {
    companyId,
    entityId: ticketId,
    entities: ["support_tickets", "support_ticket_comments"] as const,
  };
}

export function assertTicketAuditRowInScope(
  row: { companyId?: string | null; entityId?: string | null; entity?: string | null },
  companyId: string,
  ticketId: string,
): boolean {
  if (row.companyId != null && row.companyId !== companyId) return false;
  if (row.entityId !== ticketId) return false;
  const entities = buildTicketAuditQueryScope(companyId, ticketId).entities;
  if (row.entity && !(entities as readonly string[]).includes(row.entity)) return false;
  return true;
}

export function isTicketTerminalStatus(status: string): boolean {
  return status === "resolved" || status === "closed";
}

/** Active SLA countdown only while ticket is open; terminal tickets keep historical due. */
export function ticketSlaPresentation(
  status: string,
  slaDueAt: string | null,
): { showDueAt: boolean; dueIsHistorical: boolean } {
  if (!slaDueAt) return { showDueAt: false, dueIsHistorical: false };
  const terminal = isTicketTerminalStatus(status);
  return { showDueAt: true, dueIsHistorical: terminal };
}

export function mapConversationMessageToTicket360Row(input: {
  id: string;
  conversation_id: string;
  sequence_number: number;
  message_type: string;
  content: string;
  content_type?: string;
  status: string;
  created_at: string;
  created_by?: string | null;
  attachment_type?: string | null;
  attachment_url?: string | null;
  metadata?: Record<string, unknown> | null;
}): Ticket360MessageRow {
  const meta = input.metadata ?? {};
  const isInternalNote =
    input.message_type === "internal_note" ||
    meta.isInternalNote === true ||
    meta.internal === true;

  return {
    id: input.id,
    conversationId: input.conversation_id,
    sequenceNumber: Number(input.sequence_number ?? 0),
    messageType: input.message_type,
    content: input.content ?? "",
    contentType: input.content_type ?? "text",
    status: input.status,
    createdAt: input.created_at,
    createdBy: input.created_by ?? null,
    attachmentType: input.attachment_type ?? null,
    attachmentUrl: input.attachment_url ?? null,
    isInternalNote,
  };
}

export function sortTicket360MessagesChronological(
  rows: Ticket360MessageRow[],
): Ticket360MessageRow[] {
  return [...rows].sort((a, b) => {
    if (a.sequenceNumber !== b.sequenceNumber) return a.sequenceNumber - b.sequenceNumber;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * Localize a ticket status code for Activity copy via existing `tickets.status.*` keys.
 * Unknown codes fall back to the raw value (never throws / never blanks the UI).
 */
export function localizeTicketActivityStatus(
  status: string,
  t: (key: string, opts?: Record<string, string>) => string,
): string {
  const code = status.trim();
  if (!code) return status;
  const key = `tickets.status.${code}`;
  const translated = t(key, { defaultValue: code });
  // i18next may return the key path when missing; keep the raw DB code instead.
  if (!translated || translated === key) return code;
  return translated;
}

export function describeTicketActivityEntry(
  entry: Ticket360AuditLike,
  t: (key: string, opts?: Record<string, string>) => string,
): string {
  const meta = entry.metadata ?? {};
  if (entry.entity === "support_ticket_comments" && entry.action === "CREATE") {
    return t("tickets.360.activity.commentAdded");
  }
  if (entry.action === "CREATE") return t("tickets.360.activity.created");
  if (entry.action === "DELETE") return t("tickets.360.activity.deleted");

  const oldValues = (meta.old as Record<string, unknown> | undefined) ?? {};
  const newValues = (meta.new as Record<string, unknown> | undefined) ?? {};
  const parts: string[] = [];

  if (oldValues.status !== newValues.status && newValues.status != null) {
    parts.push(
      t("tickets.360.activity.statusChanged", {
        from: localizeTicketActivityStatus(String(oldValues.status ?? ""), t),
        to: localizeTicketActivityStatus(String(newValues.status), t),
      }),
    );
  }
  if (oldValues.priority !== newValues.priority && newValues.priority != null) {
    parts.push(
      t("tickets.360.activity.priorityChanged", {
        from: String(oldValues.priority ?? ""),
        to: String(newValues.priority),
      }),
    );
  }
  if (oldValues.assignedUserId !== newValues.assignedUserId) {
    if (!newValues.assignedUserId) parts.push(t("tickets.360.activity.unassigned"));
    else if (!oldValues.assignedUserId) parts.push(t("tickets.360.activity.assigned"));
    else parts.push(t("tickets.360.activity.reassigned"));
  }

  return parts.length > 0 ? parts.join(" · ") : t("tickets.360.activity.updated");
}

export function extractTicketAuditBeforeAfter(metadata: Record<string, unknown> | null): {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
} {
  if (!metadata) return { before: null, after: null };
  const before =
    metadata.old && typeof metadata.old === "object" && !Array.isArray(metadata.old)
      ? (metadata.old as Record<string, unknown>)
      : null;
  const after =
    metadata.new && typeof metadata.new === "object" && !Array.isArray(metadata.new)
      ? (metadata.new as Record<string, unknown>)
      : null;
  return { before, after };
}

export function resolveTicketSystemActorLabel(
  userId: string | null,
  systemLabel: string,
): string | null {
  return userId ? null : systemLabel;
}
