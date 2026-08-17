import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { collectReferenceIds, readMetadataRecord, readMetadataString } from "@/lib/audit-log/mapping";
import { AUDIT_LOG_PAGE_SIZE } from "@/lib/crm/crm-list-config";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import { supabase } from "@/lib/supabase";
import type { AuditLog, EnrichedAuditLog } from "@/lib/types";

export const AUDIT_LOGS_KEY = ["audit-logs"] as const;
/** Soft cap for the bounded list used by filters/stats (single request, not 10 round-trips). */
export const AUDIT_LOGS_MAX_ROWS = Math.min(AUDIT_LOG_PAGE_SIZE * 4, 200);

const AUDIT_LOG_COLUMNS =
  "id, user_id, company_id, action, entity, entity_id, ip_address, metadata, created_at" as const;

type ProfileRow = { id: string; full_name: string | null; email: string | null };
type CompanyRow = { id: string; name: string | null };
type RoleRow = { id: string; name: string | null };
type PermissionRow = { id: string; code: string | null };

function toRecord<T extends { id: string }>(
  rows: T[],
  pick: (row: T) => string | null | undefined,
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const value = pick(row);
    if (value?.trim()) {
      record[row.id] = value.trim();
    }
  }
  return record;
}

function resolveEntityDisplayName(
  log: AuditLog,
  lookups: {
    profiles: Record<string, string>;
    companies: Record<string, string>;
    roles: Record<string, string>;
    permissions: Record<string, string>;
    users: Record<string, string>;
  },
): string | null {
  const metadata = log.metadata ?? {};
  const metaName =
    readMetadataString(metadata, "name") ??
    readMetadataString(metadata, "full_name") ??
    readMetadataString(metadata, "email") ??
    readMetadataString(metadata, "service") ??
    readMetadataString(metadata, "code") ??
    readMetadataString(metadata, "assistant_name") ??
    readMetadataString(metadata, "invoice_number") ??
    readMetadataString(metadata, "subject");

  if (metaName) return metaName;

  const newValues = readMetadataRecord(metadata, "new");
  const oldValues = readMetadataRecord(metadata, "old");
  const nestedName =
    (newValues &&
      (readMetadataString(newValues, "name") ??
        readMetadataString(newValues, "email") ??
        readMetadataString(newValues, "assistant_name"))) ??
    (oldValues &&
      (readMetadataString(oldValues, "name") ??
        readMetadataString(oldValues, "email") ??
        readMetadataString(oldValues, "assistant_name")));
  if (nestedName) return nestedName;

  if (log.entity_id) {
    if (log.entity === "profiles") return lookups.profiles[log.entity_id] ?? null;
    if (log.entity === "companies") return lookups.companies[log.entity_id] ?? null;
    if (log.entity === "roles") return lookups.roles[log.entity_id] ?? null;
    if (log.entity === "permissions") return lookups.permissions[log.entity_id] ?? null;
  }

  if (log.entity === "user_roles") {
    const userId = readMetadataString(metadata, "user_id");
    const roleId = readMetadataString(metadata, "role_id");
    const userName = userId ? lookups.users[userId] : null;
    const roleName = roleId ? lookups.roles[roleId] : null;
    if (userName && roleName) return `${userName} · ${roleName}`;
    return userName ?? roleName;
  }

  if (log.entity === "role_permissions") {
    const roleId = readMetadataString(metadata, "role_id");
    const permissionId = readMetadataString(metadata, "permission_id");
    const roleName = roleId ? lookups.roles[roleId] : null;
    const permissionCode = permissionId ? lookups.permissions[permissionId] : null;
    if (roleName && permissionCode) return `${roleName} · ${permissionCode}`;
    return roleName ?? permissionCode;
  }

  return null;
}

export type AuditLogQueryFilters = {
  companyId?: string | null;
  userId?: string | null;
  actionContains?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  entity?: string | null;
  entityId?: string | null;
};

async function fetchAuditLogsPage(
  offset: number,
  limit: number,
  filters: AuditLogQueryFilters = {},
): Promise<AuditLog[]> {
  const from = offset;
  const to = offset + limit - 1;
  let builder = supabase
    .from("audit_logs")
    .select(AUDIT_LOG_COLUMNS)
    .order("created_at", { ascending: false });

  if (filters.companyId) builder = builder.eq("company_id", filters.companyId);
  if (filters.userId) builder = builder.eq("user_id", filters.userId);
  if (filters.entity) builder = builder.eq("entity", filters.entity);
  if (filters.entityId) builder = builder.eq("entity_id", filters.entityId);
  if (filters.actionContains) builder = builder.ilike("action", `%${filters.actionContains}%`);
  if (filters.dateFrom) builder = builder.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
  if (filters.dateTo) builder = builder.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);

  const { data, error } = await builder.range(from, to);
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditLog[];
}

/** List enrichment — profiles/companies/roles only (no per-entity booking/invoice fan-out). */
async function enrichAuditLogs(baseLogs: AuditLog[]): Promise<EnrichedAuditLog[]> {
  if (baseLogs.length === 0) return [];

  const refs = collectReferenceIds(baseLogs);
  const allUserIds = Array.from(new Set([...refs.userIds, ...refs.profileEntityIds]));
  const allCompanyIds = Array.from(new Set([...refs.companyIds, ...refs.companyEntityIds]));
  const allRoleIds = Array.from(new Set([...refs.roleIds, ...refs.roleEntityIds]));

  const [profilesResult, companiesResult, rolesResult, permissionsResult, userRolesResult] =
    await Promise.all([
      allUserIds.length > 0
        ? supabase.from("profiles").select("id, full_name, email").in("id", allUserIds)
        : Promise.resolve({ data: [], error: null }),
      allCompanyIds.length > 0
        ? supabase.from("companies").select("id, name").in("id", allCompanyIds)
        : Promise.resolve({ data: [], error: null }),
      allRoleIds.length > 0
        ? supabase.from("roles").select("id, name").in("id", allRoleIds)
        : Promise.resolve({ data: [], error: null }),
      refs.permissionIds.length > 0
        ? supabase.from("permissions").select("id, code").in("id", refs.permissionIds)
        : Promise.resolve({ data: [], error: null }),
      refs.userIds.length > 0
        ? supabase
            .from("user_roles")
            .select("user_id, role_id, roles(name)")
            .in("user_id", refs.userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  for (const result of [
    profilesResult,
    companiesResult,
    rolesResult,
    permissionsResult,
    userRolesResult,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  const profileRows = (profilesResult.data ?? []) as ProfileRow[];
  const profileMap = new Map(profileRows.map((row) => [row.id, row]));
  const companyMap = new Map(((companiesResult.data ?? []) as CompanyRow[]).map((row) => [row.id, row]));

  const userNames = toRecord(profileRows, (row) => row.full_name ?? row.email ?? null);
  const companyNames = toRecord((companiesResult.data ?? []) as CompanyRow[], (row) => row.name);
  const roleNames = toRecord((rolesResult.data ?? []) as RoleRow[], (row) => row.name);
  const permissionCodes = toRecord((permissionsResult.data ?? []) as PermissionRow[], (row) => row.code);
  const profileDisplayNames = toRecord(profileRows, (row) => row.full_name ?? row.email ?? null);

  const actorRoleByUser = new Map<string, string>();
  for (const row of userRolesResult.data ?? []) {
    if (actorRoleByUser.has(row.user_id)) continue;
    const role = row.roles as { name?: string | null } | null;
    if (role?.name) {
      actorRoleByUser.set(row.user_id, role.name);
    }
  }

  const lookups = {
    profiles: profileDisplayNames,
    companies: companyNames,
    roles: roleNames,
    permissions: permissionCodes,
    users: userNames,
  };

  // One shared map for all rows — avoid cloning large objects 200×.
  const resolvedReferences = {
    companyNames,
    roleNames,
    userNames,
    permissionCodes,
  };

  return baseLogs.map((entry) => {
    const profileRow = entry.user_id ? profileMap.get(entry.user_id) : undefined;

    const metadata = entry.metadata ?? {};
    const newValues = readMetadataRecord(metadata, "new");
    const oldValues = readMetadataRecord(metadata, "old");
    const metadataCompanyId =
      readMetadataString(newValues ?? {}, "company_id") ??
      readMetadataString(oldValues ?? {}, "company_id") ??
      readMetadataString(metadata, "company_id");
    const effectiveCompanyId =
      entry.company_id ??
      (entry.entity === "companies" ? entry.entity_id : null) ??
      metadataCompanyId;

    const companyRow = effectiveCompanyId ? companyMap.get(effectiveCompanyId) : undefined;

    return {
      ...entry,
      metadata,
      company_id: effectiveCompanyId ?? entry.company_id,
      profile: profileRow
        ? {
            id: profileRow.id,
            full_name: profileRow.full_name,
            email: profileRow.email,
          }
        : null,
      company: companyRow
        ? { id: companyRow.id, name: companyRow.name }
        : effectiveCompanyId && companyNames[effectiveCompanyId]
          ? { id: effectiveCompanyId, name: companyNames[effectiveCompanyId] }
          : null,
      actorRoleName: entry.user_id ? (actorRoleByUser.get(entry.user_id) ?? null) : null,
      entityDisplayName: resolveEntityDisplayName(entry, lookups),
      resolvedReferences,
    };
  });
}

/** Progressive server pages for load-more UX. */
export function useAuditLogsInfinite(
  enabled = true,
  pageSize = AUDIT_LOG_PAGE_SIZE,
  filters: AuditLogQueryFilters = {},
) {
  return useInfiniteQuery({
    queryKey: [...AUDIT_LOGS_KEY, "infinite", pageSize, filters],
    enabled,
    staleTime: APP_QUERY_STALE_MS,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const rows = await fetchAuditLogsPage(pageParam, pageSize, filters);
      return {
        rows: await enrichAuditLogs(rows),
        nextOffset: rows.length < pageSize ? null : pageParam + pageSize,
      };
    },
    getNextPageParam: (lastPage, _pages, lastOffset) => {
      if (lastPage.nextOffset == null) return undefined;
      if (lastOffset + pageSize >= AUDIT_LOGS_MAX_ROWS) return undefined;
      return lastPage.nextOffset;
    },
  });
}

/**
 * Bounded recent list — one range request (not 10 sequential pages).
 * Used by Audit Logs page and customer history tab.
 */
export function useAuditLogs(
  enabled = true,
  filters: AuditLogQueryFilters = {},
  maxRows = AUDIT_LOGS_MAX_ROWS,
) {
  return useQuery({
    queryKey: [...AUDIT_LOGS_KEY, "bounded", maxRows, filters],
    enabled,
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<EnrichedAuditLog[]> => {
      const rows = await fetchAuditLogsPage(0, maxRows, filters);
      return enrichAuditLogs(rows);
    },
  });
}
