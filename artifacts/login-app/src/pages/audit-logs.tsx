import { useMemo, useState } from "react";
import { Eye, Filter, Search, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuditLogDetailsDialog } from "@/components/audit-logs/audit-log-details-dialog";
import { AuditOperationBadge } from "@/components/audit-logs/audit-operation-badge";
import { AuditStatusBadge } from "@/components/audit-logs/audit-status-badge";
import { Button } from "@/components/ui/button";
import { EmployeeIdentityCard } from "@/components/employee-identity/employee-identity-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { useAuthUser } from "@/hooks/use-rbac";
import { AUDIT_OPERATIONS } from "@/lib/audit-log/constants";
import {
  buildAuditRowViews,
  buildFilterOptions,
  filterAuditRowViews,
  type AuditLogFilters,
} from "@/lib/audit-log/normalize";
import { formatAuditTimestamp, formatIpDisplay, translateRoleName } from "@/lib/audit-log/presenter";

const PAGE_SIZE = 12;

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof ShieldCheck;
  accent?: string;
}) {
  return (
    <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className={`w-4 h-4 ${accent ?? "text-primary"}`} />
      </div>
      <p className="text-2xl font-bold tracking-tight mt-3">{value}</p>
    </div>
  );
}

export function AuditLogsPage() {
  const { t, i18n } = useTranslation("common");
  const { isSuperAdmin, hasPermission } = useAuthUser();
  const canViewAuditLogs = isSuperAdmin || hasPermission("audit_logs.view");
  const { data: logs = [], isLoading, error } = useAuditLogs(canViewAuditLogs);

  const [search, setSearch] = useState("");
  const [operationFilter, setOperationFilter] = useState<AuditLogFilters["operation"]>("all");
  const [statusFilter, setStatusFilter] = useState<AuditLogFilters["status"]>("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const rowViews = useMemo(() => buildAuditRowViews(logs, t), [logs, t]);

  const filterOptions = useMemo(() => buildFilterOptions(rowViews), [rowViews]);

  const filters = useMemo<AuditLogFilters>(
    () => ({
      search,
      operation: operationFilter,
      status: statusFilter,
      companyId: companyFilter,
      userId: userFilter,
      roleKey: roleFilter,
      dateFrom,
      dateTo,
    }),
    [search, operationFilter, statusFilter, companyFilter, userFilter, roleFilter, dateFrom, dateTo],
  );

  const filtered = useMemo(() => filterAuditRowViews(rowViews, filters), [rowViews, filters]);

  const selectedLog = useMemo(
    () => rowViews.find((row) => row.log.id === selectedLogId)?.log ?? null,
    [rowViews, selectedLogId],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!canViewAuditLogs) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("auditLogs.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auditLogs.noPermission")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("auditLogs.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("auditLogs.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("auditLogs.stats.total")} value={logs.length} icon={ShieldCheck} />
        <StatCard
          label={t("auditLogs.stats.create")}
          value={rowViews.filter((row) => row.operation === "CREATE").length}
          icon={ShieldCheck}
          accent="text-emerald-400"
        />
        <StatCard
          label={t("auditLogs.stats.update")}
          value={rowViews.filter((row) => row.operation === "UPDATE").length}
          icon={ShieldCheck}
          accent="text-amber-400"
        />
        <StatCard
          label={t("auditLogs.stats.delete")}
          value={rowViews.filter((row) => row.operation === "DELETE").length}
          icon={ShieldCheck}
          accent="text-rose-400"
        />
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error.message}
        </div>
      )}

      <div className="bg-card/40 border border-white/5 rounded-2xl backdrop-blur-sm overflow-hidden">
        <div className="p-5 border-b border-white/5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[240px] flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-4 py-2.5">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={(event) => {
                  setPage(1);
                  setSearch(event.target.value);
                }}
                placeholder={t("auditLogs.searchPlaceholder")}
                className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />
            <span>{t("auditLogs.filters.title")}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <select
              value={operationFilter}
              onChange={(event) => {
                setPage(1);
                setOperationFilter(event.target.value as AuditLogFilters["operation"]);
              }}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-xs outline-none focus:border-primary/40 transition-colors"
            >
              <option value="all">{t("auditLogs.filters.allOperations")}</option>
              {AUDIT_OPERATIONS.map((operation) => (
                <option key={operation} value={operation}>
                  {t(`auditLogs.operations.${operation}`)}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value as AuditLogFilters["status"]);
              }}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-xs outline-none focus:border-primary/40 transition-colors"
            >
              <option value="all">{t("auditLogs.filters.allStatuses")}</option>
              <option value="success">{t("auditLogs.statuses.success")}</option>
              <option value="failed">{t("auditLogs.statuses.failed")}</option>
              <option value="warning">{t("auditLogs.statuses.warning")}</option>
            </select>

            <select
              value={companyFilter}
              onChange={(event) => {
                setPage(1);
                setCompanyFilter(event.target.value);
              }}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-xs outline-none focus:border-primary/40 transition-colors"
            >
              <option value="all">{t("auditLogs.filters.allCompanies")}</option>
              {filterOptions.companies.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>

            <select
              value={roleFilter}
              onChange={(event) => {
                setPage(1);
                setRoleFilter(event.target.value);
              }}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-xs outline-none focus:border-primary/40 transition-colors"
            >
              <option value="all">{t("auditLogs.filters.allRoles")}</option>
              {filterOptions.roles.map(([roleKey, roleName]) => (
                <option key={roleKey} value={roleKey}>
                  {translateRoleName(roleName, t)}
                </option>
              ))}
            </select>

            <select
              value={userFilter}
              onChange={(event) => {
                setPage(1);
                setUserFilter(event.target.value);
              }}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-xs outline-none focus:border-primary/40 transition-colors"
            >
              <option value="all">{t("auditLogs.filters.allUsers")}</option>
              {filterOptions.users.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setPage(1);
                setDateFrom(event.target.value);
              }}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-xs outline-none focus:border-primary/40 transition-colors"
              aria-label={t("auditLogs.filters.dateFrom")}
            />

            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setPage(1);
                setDateTo(event.target.value);
              }}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-xs outline-none focus:border-primary/40 transition-colors"
              aria-label={t("auditLogs.filters.dateTo")}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="divide-y divide-white/5">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex items-center px-6 py-4 gap-4">
                <div className="w-9 h-9 rounded-full bg-white/10 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 bg-white/10 rounded animate-pulse" />
                  <div className="h-2.5 w-24 bg-white/5 rounded animate-pulse" />
                </div>
                <div className="h-5 w-16 bg-white/10 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : paginated.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">{t("auditLogs.empty")}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead>{t("auditLogs.columns.operation")}</TableHead>
                    <TableHead>{t("auditLogs.columns.status")}</TableHead>
                    <TableHead className="min-w-[220px]">{t("auditLogs.columns.details")}</TableHead>
                    <TableHead className="min-w-[180px]">{t("auditLogs.columns.user")}</TableHead>
                    <TableHead>{t("auditLogs.columns.role")}</TableHead>
                    <TableHead>{t("auditLogs.columns.company")}</TableHead>
                    <TableHead>{t("auditLogs.columns.ip")}</TableHead>
                    <TableHead className="min-w-[140px]">{t("auditLogs.columns.time")}</TableHead>
                    <TableHead className="text-end">{t("auditLogs.columns.view")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((row) => {
                    const timestamp = formatAuditTimestamp(row.log.created_at, i18n.language, t);

                    return (
                      <TableRow key={row.log.id} className="border-white/5 hover:bg-white/[0.02]">
                        <TableCell>
                          <AuditOperationBadge operation={row.operation} />
                        </TableCell>
                        <TableCell>
                          <AuditStatusBadge status={row.status} />
                        </TableCell>
                        <TableCell>
                          <p className="text-sm leading-relaxed">{row.description}</p>
                        </TableCell>
                        <TableCell>
                          <EmployeeIdentityCard
                            userId={row.userId ?? row.log.profile?.id}
                            fallbackName={row.userName}
                            fallbackEmail={row.userEmail}
                            showEmail
                            showJobTitle
                          />
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5">
                            {translateRoleName(row.log.actorRoleName, t)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {row.companyName ?? t("auditLogs.fallbacks.unavailable")}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono" dir="ltr">
                            {formatIpDisplay(row.log.ip_address, t)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="text-sm">{timestamp.relative}</p>
                            <p className="text-xs text-muted-foreground" dir="ltr">
                              {timestamp.absolute}
                            </p>
                            <p className="text-xs text-muted-foreground" dir="ltr">
                              {timestamp.time}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-white/10 gap-2"
                            onClick={() => setSelectedLogId(row.log.id)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {t("auditLogs.columns.view")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="p-4 border-t border-white/5 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {t("auditLogs.pagination.pageInfo", {
                  page: safePage,
                  totalPages,
                  total: filtered.length,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10"
                  disabled={safePage <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  {t("auditLogs.pagination.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  {t("auditLogs.pagination.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <AuditLogDetailsDialog
        log={selectedLog}
        open={selectedLog !== null}
        showAdvanced={isSuperAdmin}
        onOpenChange={(open) => {
          if (!open) setSelectedLogId(null);
        }}
      />
    </div>
  );
}
