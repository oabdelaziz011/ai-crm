import type { TFunction } from "i18next";
import type { EnrichedAuditLog } from "@/lib/types";
import type { AuditOperation, AuditStatus } from "@/lib/audit-log/constants";
import {
  getEntityLabelKey,
  normalizeRoleKey,
  readMetadataRecord,
  readMetadataString,
  resolveAuditOperation,
  resolveAuditStatus,
} from "@/lib/audit-log/mapping";
import {
  buildActivitySummary,
} from "@/lib/audit-log/activity-summary";
import {
  buildAuditDescription,
  buildLookupContext,
  formatMetadataValue,
  translateMetadataField,
  type LookupContext,
} from "@/lib/audit-log/presenter";

export type AuditChangedField = {
  key: string;
  label: string;
  from: string;
  to: string;
};

export type AuditRowView = {
  log: EnrichedAuditLog;
  operation: AuditOperation;
  status: AuditStatus;
  companyId: string | null;
  userId: string | null;
  roleKey: string | null;
  createdAtMs: number;
  searchBlob: string;
  description: string;
  userName: string;
  userEmail: string | null;
  companyName: string | null;
  entityName: string | null;
  entityResolved: boolean;
};

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim();
}

export function resolveCompanyId(log: EnrichedAuditLog): string | null {
  if (log.company?.id) return log.company.id;
  if (log.company_id) return log.company_id;
  if (log.entity === "companies" && log.entity_id) return log.entity_id;

  const metadata = log.metadata ?? {};
  const newValues = readMetadataRecord(metadata, "new");
  const oldValues = readMetadataRecord(metadata, "old");

  return (
    readMetadataString(newValues ?? {}, "company_id") ??
    readMetadataString(oldValues ?? {}, "company_id") ??
    readMetadataString(metadata, "company_id")
  );
}

export function resolveCompanyName(log: EnrichedAuditLog): string | null {
  if (log.company?.name?.trim()) return log.company.name.trim();

  const companyId = resolveCompanyId(log);
  if (companyId && log.resolvedReferences.companyNames[companyId]) {
    return log.resolvedReferences.companyNames[companyId];
  }

  if (log.entity === "companies") {
    return log.entityDisplayName;
  }

  return null;
}

export function resolveRoleKey(log: EnrichedAuditLog): string | null {
  if (!log.actorRoleName?.trim()) return null;
  return normalizeRoleKey(log.actorRoleName) ?? log.actorRoleName.trim().toLowerCase();
}

export function isEntityResolved(log: EnrichedAuditLog): boolean {
  if (log.entityDisplayName?.trim()) return true;

  const metadata = log.metadata ?? {};
  if (
    readMetadataString(metadata, "name") ||
    readMetadataString(metadata, "email") ||
    readMetadataString(metadata, "full_name") ||
    readMetadataString(metadata, "service")
  ) {
    return true;
  }

  const newValues = readMetadataRecord(metadata, "new");
  const oldValues = readMetadataRecord(metadata, "old");
  if (newValues && resolveNameFromRecord(newValues)) return true;
  if (oldValues && resolveNameFromRecord(oldValues)) return true;

  if (log.entity === "user_roles" || log.entity === "role_permissions") {
    const userId = readMetadataString(metadata, "user_id");
    const roleId = readMetadataString(metadata, "role_id");
    if (userId && log.resolvedReferences.userNames[userId]) return true;
    if (roleId && log.resolvedReferences.roleNames[roleId]) return true;
  }

  return false;
}

function resolveNameFromRecord(record: Record<string, unknown>): string | null {
  return (
    readMetadataString(record, "name") ??
    readMetadataString(record, "full_name") ??
    readMetadataString(record, "email") ??
    readMetadataString(record, "service") ??
    null
  );
}

function buildSearchBlob(
  log: EnrichedAuditLog,
  description: string,
  userName: string,
  userEmail: string | null,
  companyName: string | null,
  entityName: string | null,
  t: TFunction<"common">,
): string {
  const operation = resolveAuditOperation(log);
  const parts = [
    userName,
    userEmail ?? "",
    companyName ?? "",
    entityName ?? "",
    description,
    log.ip_address ?? "",
    log.actorRoleName ?? "",
    log.entity,
    operation,
    log.action,
    t(`auditLogs.operations.${operation}`),
    t(`auditLogs.operations.${operation}`, { lng: "en" }),
    t(`auditLogs.operations.${operation}`, { lng: "ar" }),
  ];

  return normalizeSearchText(parts.filter(Boolean).join(" "));
}

export function buildAuditRowViews(
  logs: EnrichedAuditLog[],
  t: TFunction<"common">,
): AuditRowView[] {
  const lookupContext = buildLookupContext(logs);

  return logs.map((log) => {
    const operation = resolveAuditOperation(log);
    const status = resolveAuditStatus(log);
    const description = buildAuditDescription(log, t, lookupContext);
    const userName =
      log.profile?.full_name?.trim() ||
      log.profile?.email?.trim() ||
      (log.user_id ? t("auditLogs.fallbacks.deletedUser") : t("auditLogs.fallbacks.systemUser"));
    const userEmail = log.profile?.email?.trim() ?? null;
    const companyName = resolveCompanyName(log);
    const entityName =
      log.entityDisplayName?.trim() || t(getEntityLabelKey(log.entity));
    const entityResolved = isEntityResolved(log);

    return {
      log,
      operation,
      status,
      companyId: resolveCompanyId(log),
      userId: log.user_id,
      roleKey: resolveRoleKey(log),
      createdAtMs: new Date(log.created_at).getTime(),
      searchBlob: buildSearchBlob(log, description, userName, userEmail, companyName, entityName, t),
      description,
      userName,
      userEmail,
      companyName,
      entityName,
      entityResolved,
    };
  });
}

export function getChangedFields(
  log: EnrichedAuditLog,
  context: LookupContext,
  t: TFunction<"common">,
): AuditChangedField[] {
  const metadata = log.metadata ?? {};
  const oldValues = readMetadataRecord(metadata, "old");
  const newValues = readMetadataRecord(metadata, "new");
  const operation = resolveAuditOperation(log);

  if (oldValues && newValues) {
    const keys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
    const changes: AuditChangedField[] = [];

    for (const key of keys) {
      const oldRaw = oldValues[key];
      const newRaw = newValues[key];
      const from = formatMetadataValue(key, oldRaw, context, t);
      const to = formatMetadataValue(key, newRaw, context, t);
      if (from !== to) {
        changes.push({
          key,
          label: translateMetadataField(key, t),
          from,
          to,
        });
      }
    }

    return changes;
  }

  if (log.entity === "user_roles") {
    const roleId = readMetadataString(metadata, "role_id");
    const roleName = roleId
      ? formatMetadataValue("role_id", roleId, context, t)
      : t("auditLogs.fallbacks.unavailable");

    if (operation === "DELETE") {
      return [
        {
          key: "role_id",
          label: translateMetadataField("role_id", t),
          from: roleName,
          to: t("auditLogs.fallbacks.none"),
        },
      ];
    }

    return [
      {
        key: "role_id",
        label: translateMetadataField("role_id", t),
        from: t("auditLogs.fallbacks.none"),
        to: roleName,
      },
    ];
  }

  if (log.entity === "role_permissions") {
    const permissionId = readMetadataString(metadata, "permission_id");
    const permissionCode = permissionId
      ? formatMetadataValue("permission_id", permissionId, context, t)
      : t("auditLogs.fallbacks.unavailable");

    if (operation === "DELETE") {
      return [
        {
          key: "permission_id",
          label: translateMetadataField("permission_id", t),
          from: permissionCode,
          to: t("auditLogs.fallbacks.none"),
        },
      ];
    }

    return [
      {
        key: "permission_id",
        label: translateMetadataField("permission_id", t),
        from: t("auditLogs.fallbacks.none"),
        to: permissionCode,
      },
    ];
  }

  if (operation === "CREATE") {
    const flatValues = Object.entries(metadata).filter(
      ([key]) => !["old", "new", "operation", "status", "auth_event"].includes(key),
    );
    if (flatValues.length === 0) return [];

    return flatValues.map(([key, value]) => ({
      key,
      label: translateMetadataField(key, t),
      from: t("auditLogs.fallbacks.none"),
      to: formatMetadataValue(key, value, context, t),
    }));
  }

  if (operation === "DELETE") {
    const flatValues = Object.entries(metadata).filter(
      ([key]) => !["old", "new", "operation", "status", "auth_event"].includes(key),
    );
    if (flatValues.length === 0) return [];

    return flatValues.map(([key, value]) => ({
      key,
      label: translateMetadataField(key, t),
      from: formatMetadataValue(key, value, context, t),
      to: t("auditLogs.fallbacks.none"),
    }));
  }

  return [];
}

export function buildAuditDetailSummary(
  log: EnrichedAuditLog,
  changes: AuditChangedField[],
  context: LookupContext,
  t: TFunction<"common">,
): string {
  if (!isEntityResolved(log)) {
    return t("auditLogs.details.unresolvedEntity");
  }

  void changes;
  return buildActivitySummary(log, context, t);
}

export type AuditLogFilters = {
  search: string;
  operation: "all" | AuditOperation;
  status: "all" | AuditStatus;
  companyId: string;
  userId: string;
  roleKey: string;
  dateFrom: string;
  dateTo: string;
};

export function filterAuditRowViews(rows: AuditRowView[], filters: AuditLogFilters): AuditRowView[] {
  const query = normalizeSearchText(filters.search);

  return rows.filter((row) => {
    if (query && !row.searchBlob.includes(query)) return false;
    if (filters.operation !== "all" && row.operation !== filters.operation) return false;
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.companyId !== "all" && row.companyId !== filters.companyId) return false;
    if (filters.userId !== "all" && row.userId !== filters.userId) return false;
    if (filters.roleKey !== "all" && row.roleKey !== filters.roleKey) return false;

    if (filters.dateFrom) {
      const fromMs = new Date(`${filters.dateFrom}T00:00:00`).getTime();
      if (row.createdAtMs < fromMs) return false;
    }

    if (filters.dateTo) {
      const toMs = new Date(`${filters.dateTo}T23:59:59.999`).getTime();
      if (row.createdAtMs > toMs) return false;
    }

    return true;
  });
}

export function buildFilterOptions(rows: AuditRowView[]) {
  const companies = new Map<string, string>();
  const roles = new Map<string, string>();
  const users = new Map<string, string>();

  for (const row of rows) {
    if (row.companyId && row.companyName) {
      companies.set(row.companyId, row.companyName);
    }
    if (row.roleKey && row.log.actorRoleName) {
      roles.set(row.roleKey, row.log.actorRoleName);
    }
    if (row.userId && row.userName) {
      users.set(row.userId, row.userName);
    }
  }

  return {
    companies: Array.from(companies.entries()).sort((a, b) => a[1].localeCompare(b[1])),
    roles: Array.from(roles.entries()).sort((a, b) => a[1].localeCompare(b[1])),
    users: Array.from(users.entries()).sort((a, b) => a[1].localeCompare(b[1])),
  };
}
