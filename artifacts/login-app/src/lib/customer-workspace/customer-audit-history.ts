/**
 * Customer audit History — pure presentation helpers over audit_logs.
 * Never matches by phone / last-9. Never invents before/after or actors.
 * Campaigns remain a separate feature; campaign recipient audits may appear
 * only as normal audit references when metadata.customer_id is present.
 */

function readMetadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readMetadataRecord(
  metadata: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = metadata[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export const CUSTOMER_AUDIT_HISTORY_PAGE_SIZE = 20;

export type CustomerAuditHistoryPeriod = "7d" | "30d" | "90d" | "all";

export type CustomerAuditEventFilter =
  | "all"
  | "customer"
  | "booking"
  | "ticket"
  | "invoice"
  | "campaign"
  | "other";

export type CustomerAuditSourceFilter =
  | "all"
  | "crm"
  | "marketing_campaign"
  | "system"
  | "unknown";

import type { CustomerAuditModuleAccess } from "./workspace-feature-access";

export type CustomerAuditHistoryQuery = {
  companyId: string;
  customerId: string;
  page?: number;
  pageSize?: number;
  period?: CustomerAuditHistoryPeriod | null;
  eventFilter?: CustomerAuditEventFilter | null;
  sourceFilter?: CustomerAuditSourceFilter | null;
  actorUserId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  moduleAccess?: CustomerAuditModuleAccess;
};

export type CustomerAuditFieldChange = {
  field: string;
  before: string | null;
  after: string | null;
};

export type CustomerAuditHistoryItem = {
  id: string;
  companyId: string | null;
  customerId: string;
  action: string;
  entity: string;
  entityId: string | null;
  occurredAt: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  /** Display-only: user | system — never invent historical AI/portal labels. */
  actorKind: "user" | "system";
  source: string | null;
  titleKey: string;
  descriptionKey: string | null;
  changes: CustomerAuditFieldChange[];
  metadata: Record<string, unknown>;
};

export type CustomerAuditHistoryResult = {
  items: CustomerAuditHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
};

export function assertCustomerAuditHistoryQuery(input: {
  companyId: string;
  customerId: string;
}): void {
  if (!input.companyId?.trim() || !input.customerId?.trim()) {
    throw new Error("companyId and customerId are required for customer audit history");
  }
}

/** Source-contract guard: history must never match by phone. */
export function customerAuditHistoryUsesPhoneMatching(): false {
  return false;
}

export function resolveCustomerAuditHistoryDateRange(input: {
  period?: CustomerAuditHistoryPeriod | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  now?: Date;
}): { from: string | null; to: string | null } {
  if (input.dateFrom || input.dateTo) {
    return {
      from: input.dateFrom?.trim() || null,
      to: input.dateTo?.trim() || null,
    };
  }
  const period = input.period ?? "all";
  if (period === "all") return { from: null, to: null };
  const now = input.now ?? new Date();
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return {
    from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
    to: null,
  };
}

function stringifyAuditValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

const TRACKED_CHANGE_FIELDS = [
  "name",
  "email",
  "phone",
  "phone_e164",
  "status",
  "service",
  "amount",
  "priority",
  "subject",
] as const;

export function extractCustomerAuditFieldChanges(
  metadata: Record<string, unknown> | null | undefined,
): CustomerAuditFieldChange[] {
  if (!metadata || typeof metadata !== "object") return [];
  const oldValues = readMetadataRecord(metadata, "old");
  const newValues = readMetadataRecord(metadata, "new");
  if (!oldValues && !newValues) return [];

  const changes: CustomerAuditFieldChange[] = [];
  for (const field of TRACKED_CHANGE_FIELDS) {
    const before = stringifyAuditValue(oldValues?.[field]);
    const after = stringifyAuditValue(newValues?.[field]);
    if (before == null && after == null) continue;
    if (before === after) continue;
    changes.push({ field, before, after });
  }
  return changes;
}

export function resolveCustomerAuditSource(
  metadata: Record<string, unknown> | null | undefined,
  entity: string,
): string | null {
  const source = readMetadataString(metadata ?? {}, "source");
  if (source) return source;
  if (entity === "marketing_campaign_recipients" || entity === "marketing_campaigns") {
    return "marketing_campaign";
  }
  if (
    entity === "customers" ||
    entity === "bookings" ||
    entity === "scheduling_bookings" ||
    entity === "invoices" ||
    entity === "support_tickets"
  ) {
    return "crm";
  }
  return null;
}

export function resolveCustomerAuditTitleKey(input: {
  action: string;
  entity: string;
  changes: CustomerAuditFieldChange[];
  metadata?: Record<string, unknown> | null;
}): string {
  const event = readMetadataString(input.metadata ?? {}, "event");
  if (event === "recipient_created") {
    return "dashboard.customerWorkspace.history.events.campaignRecipientCreated";
  }
  if (event === "recipient_updated") {
    return "dashboard.customerWorkspace.history.events.campaignRecipientUpdated";
  }

  if (input.entity === "customers") {
    if (input.action === "CREATE") {
      return "dashboard.customerWorkspace.history.events.customerCreated";
    }
    if (input.action === "DELETE") {
      return "dashboard.customerWorkspace.history.events.customerDeleted";
    }
    if (input.changes.some((c) => c.field === "phone" || c.field === "phone_e164")) {
      return "dashboard.customerWorkspace.history.events.customerPhoneChanged";
    }
    if (input.changes.some((c) => c.field === "email")) {
      return "dashboard.customerWorkspace.history.events.customerEmailChanged";
    }
    if (input.changes.some((c) => c.field === "status")) {
      return "dashboard.customerWorkspace.history.events.customerStatusChanged";
    }
    if (input.changes.some((c) => c.field === "name")) {
      return "dashboard.customerWorkspace.history.events.customerNameChanged";
    }
    return "dashboard.customerWorkspace.history.events.customerUpdated";
  }

  if (input.entity === "scheduling_bookings" || input.entity === "bookings") {
    if (input.action === "CREATE") {
      return "dashboard.customerWorkspace.history.events.bookingCreated";
    }
    if (input.action === "DELETE") {
      return "dashboard.customerWorkspace.history.events.bookingDeleted";
    }
    return "dashboard.customerWorkspace.history.events.bookingUpdated";
  }

  if (input.entity === "support_tickets") {
    if (input.action === "CREATE") {
      return "dashboard.customerWorkspace.history.events.ticketCreated";
    }
    if (input.action === "DELETE") {
      return "dashboard.customerWorkspace.history.events.ticketDeleted";
    }
    return "dashboard.customerWorkspace.history.events.ticketUpdated";
  }

  if (input.entity === "invoices") {
    if (input.action === "CREATE") {
      return "dashboard.customerWorkspace.history.events.invoiceCreated";
    }
    if (input.action === "DELETE") {
      return "dashboard.customerWorkspace.history.events.invoiceDeleted";
    }
    return "dashboard.customerWorkspace.history.events.invoiceUpdated";
  }

  if (input.action === "CREATE") {
    return "dashboard.customerWorkspace.history.events.genericCreated";
  }
  if (input.action === "DELETE") {
    return "dashboard.customerWorkspace.history.events.genericDeleted";
  }
  return "dashboard.customerWorkspace.history.events.genericUpdated";
}

export function classifyCustomerAuditEventFilter(entity: string): CustomerAuditEventFilter {
  if (entity === "customers") return "customer";
  if (entity === "bookings" || entity === "scheduling_bookings") return "booking";
  if (entity === "support_tickets" || entity === "support_ticket_comments") return "ticket";
  if (entity === "invoices") return "invoice";
  if (
    entity === "marketing_campaign_recipients" ||
    entity === "marketing_campaigns"
  ) {
    return "campaign";
  }
  return "other";
}

export function customerAuditItemMatchesFilters(
  item: CustomerAuditHistoryItem,
  input: {
    eventFilter?: CustomerAuditEventFilter | null;
    sourceFilter?: CustomerAuditSourceFilter | null;
    actorUserId?: string | null;
  },
): boolean {
  if (input.eventFilter && input.eventFilter !== "all") {
    if (classifyCustomerAuditEventFilter(item.entity) !== input.eventFilter) {
      return false;
    }
  }
  if (input.sourceFilter && input.sourceFilter !== "all") {
    const source = item.source ?? "unknown";
    if (input.sourceFilter === "system") {
      if (item.actorKind !== "system" && source !== "system") return false;
    } else if (input.sourceFilter === "unknown") {
      if (source) return false;
    } else if (source !== input.sourceFilter) {
      return false;
    }
  }
  if (input.actorUserId?.trim()) {
    if (item.actorUserId !== input.actorUserId.trim()) return false;
  }
  return true;
}

export function sortCustomerAuditHistoryItems(
  items: CustomerAuditHistoryItem[],
): CustomerAuditHistoryItem[] {
  return [...items].sort((a, b) => {
    const byTime = b.occurredAt.localeCompare(a.occurredAt);
    if (byTime !== 0) return byTime;
    return b.id.localeCompare(a.id);
  });
}

export function paginateCustomerAuditHistoryItems(
  items: CustomerAuditHistoryItem[],
  page: number,
  pageSize: number,
): CustomerAuditHistoryResult {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  const sorted = sortCustomerAuditHistoryItems(items);
  const start = (safePage - 1) * safeSize;
  return {
    items: sorted.slice(start, start + safeSize),
    total: sorted.length,
    page: safePage,
    pageSize: safeSize,
  };
}

export type RawAuditLogRow = {
  id: string;
  user_id: string | null;
  company_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Deterministic ownership check — never phone.
 * Direct: customers.entity_id OR metadata.customer_id
 * Related: entity_id in company-scoped related id set
 */
export function auditLogBelongsToCustomer(input: {
  row: RawAuditLogRow;
  companyId: string;
  customerId: string;
  relatedEntityIds: ReadonlySet<string>;
}): boolean {
  const { row, companyId, customerId, relatedEntityIds } = input;
  const relatedHit =
    Boolean(row.entity_id) &&
    relatedEntityIds.has(`${row.entity}:${row.entity_id}`);

  // Tenant gate
  if (row.company_id != null && row.company_id !== companyId) {
    return false;
  }
  // Null-company rows only allowed for verified customer self rows or related owned entities.
  if (row.company_id == null) {
    const selfCustomer =
      row.entity === "customers" && row.entity_id === customerId;
    if (!selfCustomer && !relatedHit) return false;
  }

  if (row.entity === "customers" && row.entity_id === customerId) return true;

  const metaCustomerId = readMetadataString(row.metadata ?? {}, "customer_id");
  if (metaCustomerId === customerId) {
    // metadata customer_id still requires company match (or null already gated above)
    return row.company_id === companyId || row.company_id == null;
  }

  return relatedHit;
}

export function mapAuditLogToCustomerHistoryItem(input: {
  row: RawAuditLogRow;
  customerId: string;
  actorName?: string | null;
  actorEmail?: string | null;
}): CustomerAuditHistoryItem {
  const metadata = (input.row.metadata ?? {}) as Record<string, unknown>;
  const changes = extractCustomerAuditFieldChanges(metadata);
  const actorUserId = input.row.user_id;
  return {
    id: input.row.id,
    companyId: input.row.company_id,
    customerId: input.customerId,
    action: input.row.action,
    entity: input.row.entity,
    entityId: input.row.entity_id,
    occurredAt: input.row.created_at,
    actorUserId,
    actorName: actorUserId ? input.actorName ?? null : null,
    actorEmail: actorUserId ? input.actorEmail ?? null : null,
    actorKind: actorUserId ? "user" : "system",
    source: resolveCustomerAuditSource(metadata, input.row.entity),
    titleKey: resolveCustomerAuditTitleKey({
      action: input.row.action,
      entity: input.row.entity,
      changes,
      metadata,
    }),
    descriptionKey: null,
    changes,
    metadata,
  };
}
