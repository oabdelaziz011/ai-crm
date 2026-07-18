import type { AuditLog } from "@/lib/types";
import {
  AUDIT_OPERATIONS,
  ENTITY_I18N_KEY,
  LOCALHOST_IPS,
  type AuditOperation,
  type AuditOperationCategory,
  type AuditStatus,
  UUID_PATTERN,
} from "@/lib/audit-log/constants";

export function isAuditOperation(value: string): value is AuditOperation {
  return (AUDIT_OPERATIONS as readonly string[]).includes(value);
}

export function resolveAuditOperation(log: AuditLog): AuditOperation {
  const metadata = log.metadata ?? {};
  const metaOperation = typeof metadata.operation === "string" ? metadata.operation.toUpperCase() : "";
  if (isAuditOperation(metaOperation)) {
    return metaOperation;
  }

  const authEvent = typeof metadata.auth_event === "string" ? metadata.auth_event.toUpperCase() : "";
  if (isAuditOperation(authEvent)) {
    return authEvent;
  }

  if (log.entity === "auth") {
    const eventType = typeof metadata.event === "string" ? metadata.event.toUpperCase() : "";
    if (isAuditOperation(eventType)) {
      return eventType;
    }
  }

  return log.action;
}

export function resolveAuditStatus(log: AuditLog): AuditStatus {
  const metadata = log.metadata ?? {};
  const raw = typeof metadata.status === "string" ? metadata.status.toLowerCase() : "";
  if (raw === "failed" || raw === "failure" || raw === "error") {
    return "failed";
  }
  if (raw === "warning" || raw === "warn") {
    return "warning";
  }
  return "success";
}

export function getOperationCategory(operation: AuditOperation): AuditOperationCategory {
  if (operation === "CREATE") return "create";
  if (operation === "UPDATE") return "update";
  if (operation === "DELETE") return "delete";
  if (operation === "LOGIN" || operation === "LOGOUT" || operation === "PASSWORD_RESET" || operation === "INVITE_USER") {
    return "auth";
  }
  return "system";
}

export function getEntityLabelKey(entity: string): string {
  return ENTITY_I18N_KEY[entity] ?? "auditLogs.entities.record";
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function formatIpAddress(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const normalized = ip.trim().toLowerCase();
  if (LOCALHOST_IPS.has(normalized)) {
    return "127.0.0.1";
  }
  return ip.trim();
}

export function isLocalIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  return LOCALHOST_IPS.has(ip.trim().toLowerCase());
}

export function readMetadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

export function readMetadataRecord(metadata: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = metadata[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function readMetadataStringArray(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function normalizeRoleKey(roleName: string | null | undefined): string | null {
  if (!roleName) return null;
  const normalized = roleName.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    admin: "administrator",
    company_admin: "companyAdmin",
    companyadmin: "companyAdmin",
    owner: "administrator",
    super_admin: "administrator",
  };
  return aliases[normalized] ?? normalized;
}

export function collectReferenceIds(logs: AuditLog[]) {
  const userIds = new Set<string>();
  const companyIds = new Set<string>();
  const roleIds = new Set<string>();
  const permissionIds = new Set<string>();
  const customerIds = new Set<string>();
  const bookingIds = new Set<string>();
  const invoiceIds = new Set<string>();
  const profileEntityIds = new Set<string>();
  const companyEntityIds = new Set<string>();
  const roleEntityIds = new Set<string>();

  for (const log of logs) {
    if (log.user_id) userIds.add(log.user_id);
    if (log.company_id) companyIds.add(log.company_id);

    if (log.entity_id && isUuid(log.entity_id)) {
      if (log.entity === "profiles") profileEntityIds.add(log.entity_id);
      if (log.entity === "companies") companyEntityIds.add(log.entity_id);
      if (log.entity === "roles") roleEntityIds.add(log.entity_id);
      if (log.entity === "customers") customerIds.add(log.entity_id);
      if (log.entity === "bookings") bookingIds.add(log.entity_id);
      if (log.entity === "invoices") invoiceIds.add(log.entity_id);
    }

    const metadata = log.metadata ?? {};
    for (const key of ["user_id", "actor_id"]) {
      const value = metadata[key];
      if (typeof value === "string" && isUuid(value)) userIds.add(value);
    }
    for (const key of ["company_id"]) {
      const value = metadata[key];
      if (typeof value === "string" && isUuid(value)) companyIds.add(value);
    }
    for (const key of ["role_id"]) {
      const value = metadata[key];
      if (typeof value === "string" && isUuid(value)) roleIds.add(value);
    }
    for (const key of ["permission_id"]) {
      const value = metadata[key];
      if (typeof value === "string" && isUuid(value)) permissionIds.add(value);
    }

    const oldValues = readMetadataRecord(metadata, "old");
    const newValues = readMetadataRecord(metadata, "new");
    for (const record of [oldValues, newValues, metadata]) {
      if (!record) continue;
      if (typeof record.user_id === "string" && isUuid(record.user_id)) userIds.add(record.user_id);
      if (typeof record.company_id === "string" && isUuid(record.company_id)) companyIds.add(record.company_id);
      if (typeof record.role_id === "string" && isUuid(record.role_id)) roleIds.add(record.role_id);
      if (typeof record.permission_id === "string" && isUuid(record.permission_id)) {
        permissionIds.add(record.permission_id);
      }
    }
  }

  return {
    userIds: Array.from(userIds),
    companyIds: Array.from(companyIds),
    roleIds: Array.from(roleIds),
    permissionIds: Array.from(permissionIds),
    customerIds: Array.from(customerIds),
    bookingIds: Array.from(bookingIds),
    invoiceIds: Array.from(invoiceIds),
    profileEntityIds: Array.from(profileEntityIds),
    companyEntityIds: Array.from(companyEntityIds),
    roleEntityIds: Array.from(roleEntityIds),
  };
}
