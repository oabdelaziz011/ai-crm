/**
 * Pure presentation helpers for Ticket 360 Audit tab (no I/O).
 * Does not alter persisted audit records or query scope.
 */

import {
  extractTicketAuditBeforeAfter,
  localizeTicketActivityStatus,
  type Ticket360AuditLike,
} from "./ticket360-tab-models";

export type TicketAuditTranslate = (
  key: string,
  opts?: Record<string, string>,
) => string;

/** Known ticket fields that may appear in persisted audit snapshots. */
export const TICKET_AUDIT_FIELD_ORDER = [
  "ticketNumber",
  "subject",
  "description",
  "status",
  "priority",
  "assignedUserId",
  "customerId",
  "channel",
  "channelType",
  "createdAt",
  "updatedAt",
  "resolvedAt",
  "closedAt",
] as const;

export type TicketAuditFieldKey = (typeof TICKET_AUDIT_FIELD_ORDER)[number];

export type TicketAuditActionKind = "create" | "update" | "delete" | "comment" | "other";

export type TicketAuditChangedField = {
  field: string;
  before: unknown;
  after: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableScalar(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function valuesAreEqualForAudit(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  return stableScalar(a) === stableScalar(b);
}

/** Snapshot of ticket fields from CREATE metadata (flat or nested under `new`). */
export function extractTicketAuditCreateSnapshot(
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!metadata) return null;
  const nested = isPlainObject(metadata.new) ? metadata.new : null;
  const source = nested ?? metadata;
  const snapshot: Record<string, unknown> = {};
  for (const field of TICKET_AUDIT_FIELD_ORDER) {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      snapshot[field] = source[field];
    }
  }
  // Include any other primitive ticket-like keys present on nested `new`.
  if (nested) {
    for (const [key, value] of Object.entries(nested)) {
      if (snapshot[key] !== undefined) continue;
      if (key === "old" || key === "new") continue;
      if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        snapshot[key] = value;
      }
    }
  }
  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

export function listTicketAuditChangedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): TicketAuditChangedField[] {
  if (!before && !after) return [];
  const keys = new Set<string>([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  const ordered = [
    ...TICKET_AUDIT_FIELD_ORDER.filter((k) => keys.has(k)),
    ...[...keys].filter((k) => !(TICKET_AUDIT_FIELD_ORDER as readonly string[]).includes(k)).sort(),
  ];
  const changes: TicketAuditChangedField[] = [];
  for (const field of ordered) {
    const left = before?.[field];
    const right = after?.[field];
    if (valuesAreEqualForAudit(left, right)) continue;
    // Skip keys that exist only on one side as undefined absences without the other.
    if (left === undefined && right === undefined) continue;
    changes.push({ field, before: left ?? null, after: right ?? null });
  }
  return changes;
}

export function resolveTicketAuditActionKind(entry: Ticket360AuditLike): TicketAuditActionKind {
  if (entry.entity === "support_ticket_comments" && entry.action === "CREATE") return "comment";
  const action = String(entry.action ?? "").toUpperCase();
  if (action === "CREATE") return "create";
  if (action === "UPDATE") return "update";
  if (action === "DELETE") return "delete";
  return "other";
}

export function describeTicketAuditActionTitle(
  entry: Ticket360AuditLike,
  t: TicketAuditTranslate,
): string {
  const kind = resolveTicketAuditActionKind(entry);
  if (kind === "create") return t("tickets.360.audit.action.create");
  if (kind === "update") return t("tickets.360.audit.action.update");
  if (kind === "delete") return t("tickets.360.audit.action.delete");
  if (kind === "comment") return t("tickets.360.audit.action.comment");
  const action = String(entry.action ?? "").trim() || "UNKNOWN";
  return t("tickets.360.audit.action.unknown", { action });
}

export function localizeTicketAuditFieldLabel(
  field: string,
  t: TicketAuditTranslate,
): string {
  const key = `tickets.360.audit.fields.${field}`;
  const translated = t(key, { defaultValue: field });
  if (!translated || translated === key) return field;
  return translated;
}

export function localizeTicketAuditFieldValue(
  field: string,
  value: unknown,
  t: TicketAuditTranslate,
): string {
  if (value == null || value === "") {
    if (field === "assignedUserId") return t("tickets.filter.unassigned");
    return "—";
  }
  if (field === "status") {
    return localizeTicketActivityStatus(String(value), t);
  }
  if (field === "priority") {
    const code = String(value).trim();
    const key = `tickets.priority.${code}`;
    const translated = t(key, { defaultValue: code });
    if (!translated || translated === key) return code;
    return translated;
  }
  if (field === "assignedUserId") {
    // Human name resolution happens in the UI; keep ID fallback here for pure tests.
    return String(value);
  }
  if (field === "channel" || field === "channelType") {
    const code = String(value).trim();
    const key = `tickets.channels.${code}`;
    const translated = t(key, { defaultValue: code });
    if (!translated || translated === key) return code;
    return translated;
  }
  return String(value);
}

export function formatTicketAuditTimelineDate(
  value: string | null | undefined,
  locale: string,
): string {
  if (!value) return "—";
  try {
    const isArabic = locale.toLowerCase().startsWith("ar");
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: isArabic ? "long" : "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      numberingSystem: "latn",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export type TicketAuditPresentationModel = {
  kind: TicketAuditActionKind;
  title: string;
  entityLabel: string;
  createSnapshot: Record<string, unknown> | null;
  changedFields: TicketAuditChangedField[];
  hasRawMetadata: boolean;
};

export function buildTicketAuditPresentationModel(
  entry: Ticket360AuditLike,
  t: TicketAuditTranslate,
): TicketAuditPresentationModel {
  const kind = resolveTicketAuditActionKind(entry);
  const { before, after } = extractTicketAuditBeforeAfter(entry.metadata);
  const createSnapshot =
    kind === "create" || kind === "comment"
      ? extractTicketAuditCreateSnapshot(entry.metadata)
      : null;
  const changedFields =
    kind === "update" || (kind === "other" && (before || after))
      ? listTicketAuditChangedFields(before, after)
      : [];

  return {
    kind,
    title: describeTicketAuditActionTitle(entry, t),
    entityLabel: t("tickets.360.audit.entity.ticket"),
    createSnapshot,
    changedFields,
    hasRawMetadata: Boolean(entry.metadata && Object.keys(entry.metadata).length > 0),
  };
}
