import { format, formatDistanceToNow } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import type { TFunction } from "i18next";
import type { EnrichedAuditLog } from "@/lib/types";
import {
  getOperationCategory,
  isLocalIp,
  isUuid,
  normalizeRoleKey,
  resolveAuditOperation,
  resolveAuditStatus,
} from "@/lib/audit-log/mapping";
import { METADATA_FIELD_I18N_KEY } from "@/lib/audit-log/constants";
import { buildActivitySummary } from "@/lib/audit-log/activity-summary";

export type LookupContext = {
  companyNames: Map<string, string>;
  roleNames: Map<string, string>;
  userNames: Map<string, string>;
  permissionCodes: Map<string, string>;
};

function getDateLocale(language: string) {
  return language.startsWith("ar") ? ar : enUS;
}

const KNOWN_ROLE_KEYS = new Set([
  "administrator",
  "companyAdmin",
  "manager",
  "employee",
  "viewer",
]);

export function translateRoleName(roleName: string | null | undefined, t: TFunction<"common">): string {
  if (!roleName?.trim()) {
    return t("auditLogs.fallbacks.noRole");
  }

  const roleKey = normalizeRoleKey(roleName);
  if (roleKey && KNOWN_ROLE_KEYS.has(roleKey)) {
    return t(`auditLogs.roles.${roleKey}`);
  }

  return roleName.trim();
}

export function formatAuditTimestamp(isoDate: string, language: string, t: TFunction<"common">) {
  const date = new Date(isoDate);
  const locale = getDateLocale(language);
  const relative = formatDistanceToNow(date, { addSuffix: true, locale });
  const absolute = format(date, language.startsWith("ar") ? "d MMMM yyyy" : "d MMM yyyy", { locale });
  const time = format(date, language.startsWith("ar") ? "hh:mm a" : "h:mm a", { locale });

  return { relative, absolute, time };
}

export function formatIpDisplay(ip: string | null | undefined, t: TFunction<"common">): string {
  if (!ip) return t("auditLogs.fallbacks.unavailable");
  if (isLocalIp(ip)) {
    return t("auditLogs.ip.local");
  }
  return ip;
}

export function formatMetadataValue(
  key: string,
  value: unknown,
  context: LookupContext,
  t: TFunction<"common">,
): string {
  if (value === null || value === undefined || value === "") {
    return t("auditLogs.fallbacks.none");
  }

  if (typeof value === "boolean") {
    return value ? t("auditLogs.values.yes") : t("auditLogs.values.no");
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    if (key === "company_id" && isUuid(value)) {
      return context.companyNames.get(value) ?? t("auditLogs.fallbacks.unavailable");
    }
    if (key === "role_id" && isUuid(value)) {
      return context.roleNames.get(value) ?? t("auditLogs.fallbacks.unavailable");
    }
    if (key === "user_id" && isUuid(value)) {
      return context.userNames.get(value) ?? t("auditLogs.fallbacks.deletedUser");
    }
    if (key === "permission_id" && isUuid(value)) {
      return context.permissionCodes.get(value) ?? t("auditLogs.fallbacks.unavailable");
    }
    if (isUuid(value)) {
      return t("auditLogs.fallbacks.unavailable");
    }
    return value;
  }

  return t("auditLogs.fallbacks.unavailable");
}

export function translateMetadataField(key: string, t: TFunction<"common">): string {
  const i18nKey = METADATA_FIELD_I18N_KEY[key];
  return i18nKey ? t(i18nKey) : key.replace(/_/g, " ");
}

export function buildLookupContext(logs: EnrichedAuditLog[]): LookupContext {
  const companyNames = new Map<string, string>();
  const roleNames = new Map<string, string>();
  const userNames = new Map<string, string>();
  const permissionCodes = new Map<string, string>();

  for (const log of logs) {
    if (log.company?.id && log.company.name) {
      companyNames.set(log.company.id, log.company.name);
    }
    if (log.profile?.id) {
      userNames.set(
        log.profile.id,
        log.profile.full_name?.trim() || log.profile.email?.trim() || "",
      );
    }

    for (const [id, name] of Object.entries(log.resolvedReferences.companyNames)) {
      companyNames.set(id, name);
    }
    for (const [id, name] of Object.entries(log.resolvedReferences.roleNames)) {
      roleNames.set(id, name);
    }
    for (const [id, name] of Object.entries(log.resolvedReferences.userNames)) {
      userNames.set(id, name);
    }
    for (const [id, code] of Object.entries(log.resolvedReferences.permissionCodes)) {
      permissionCodes.set(id, code);
    }
  }

  return { companyNames, roleNames, userNames, permissionCodes };
}

export function getUserDisplay(log: EnrichedAuditLog, t: TFunction<"common">) {
  if (!log.user_id && !log.profile) {
    return {
      name: t("auditLogs.fallbacks.systemUser"),
      email: null as string | null,
      deleted: false,
      initials: "S",
    };
  }

  if (!log.profile) {
    return {
      name: t("auditLogs.fallbacks.deletedUser"),
      email: null,
      deleted: true,
      initials: "?",
    };
  }

  const name = log.profile.full_name?.trim() || log.profile.email?.trim() || t("auditLogs.fallbacks.unavailable");
  return {
    name,
    email: log.profile.email,
    deleted: false,
    initials: name.charAt(0).toUpperCase(),
  };
}

export function getCompanyDisplay(log: EnrichedAuditLog, t: TFunction<"common">): string {
  return log.company?.name?.trim() || t("auditLogs.fallbacks.unavailable");
}

export function buildAuditDescription(
  log: EnrichedAuditLog,
  t: TFunction<"common">,
  context: LookupContext,
): string {
  return buildActivitySummary(log, context, t);
}

export { getOperationCategory, resolveAuditOperation, resolveAuditStatus };
