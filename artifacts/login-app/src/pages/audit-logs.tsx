import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Clock3, Filter, Search, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthUser } from "@/hooks/use-rbac";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { Button } from "@/components/ui/button";
import type { AuditAction } from "@/lib/types";

const PAGE_SIZE = 12;

function ActionBadge({ action }: { action: AuditAction }) {
  const classes =
    action === "CREATE"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : action === "UPDATE"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
        : "border-rose-500/30 bg-rose-500/10 text-rose-400";

  return <span className={`text-xs font-mono px-2.5 py-1 rounded-full border ${classes}`}>{action}</span>;
}

export function AuditLogsPage() {
  const { t } = useTranslation("common");
  const { isSuperAdmin, hasPermission } = useAuthUser();
  const canViewAuditLogs = isSuperAdmin || hasPermission("audit_logs.view");

  const { data: logs = [], isLoading, error } = useAuditLogs(canViewAuditLogs);

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<"all" | AuditAction>("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [page, setPage] = useState(1);

  const entityOptions = useMemo(
    () => Array.from(new Set(logs.map((entry) => entry.entity).filter(Boolean))).sort(),
    [logs],
  );

  const filtered = useMemo(() => {
    return logs.filter((entry) => {
      const haystack = [
        entry.entity,
        entry.entity_id ?? "",
        entry.profile?.full_name ?? "",
        entry.user_id ?? "",
        entry.company?.name ?? "",
        entry.ip_address ?? "",
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = haystack.includes(search.toLowerCase());
      const matchesAction = actionFilter === "all" || entry.action === actionFilter;
      const matchesEntity = entityFilter === "all" || entry.entity === entityFilter;
      return matchesSearch && matchesAction && matchesEntity;
    });
  }, [logs, search, actionFilter, entityFilter]);

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
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("auditLogs.stats.total")}</span>
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold tracking-tight mt-3">{logs.length}</p>
        </div>
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("auditLogs.stats.create")}</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight mt-3">{logs.filter((entry) => entry.action === "CREATE").length}</p>
        </div>
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("auditLogs.stats.update")}</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight mt-3">{logs.filter((entry) => entry.action === "UPDATE").length}</p>
        </div>
        <div className="bg-card/40 border border-white/5 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("auditLogs.stats.delete")}</span>
            <ShieldCheck className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight mt-3">{logs.filter((entry) => entry.action === "DELETE").length}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error.message}
        </div>
      )}

      <div className="bg-card/40 border border-white/5 rounded-2xl backdrop-blur-sm overflow-hidden">
        <div className="p-5 border-b border-white/5 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-4 py-2.5">
            <Search className="w-4 h-4 text-muted-foreground" />
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

          <div className="flex items-center gap-2 min-w-[150px]">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={actionFilter}
              onChange={(event) => {
                setPage(1);
                setActionFilter(event.target.value as "all" | AuditAction);
              }}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2 text-xs outline-none focus:border-primary/40 transition-colors"
            >
              <option value="all">{t("auditLogs.filters.allActions")}</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>

          <div className="min-w-[180px]">
            <select
              value={entityFilter}
              onChange={(event) => {
                setPage(1);
                setEntityFilter(event.target.value);
              }}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2 text-xs outline-none focus:border-primary/40 transition-colors"
            >
              <option value="all">{t("auditLogs.filters.allEntities")}</option>
              {entityOptions.map((entity) => (
                <option key={entity} value={entity}>
                  {entity}
                </option>
              ))}
            </select>
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
            <div className="divide-y divide-white/5">
              {paginated.map((entry) => (
                <div key={entry.id} className="grid grid-cols-1 lg:grid-cols-12 px-6 py-4 hover:bg-white/[0.02] transition-colors gap-3 lg:items-center">
                  <div className="lg:col-span-2 min-w-0">
                    <p className="text-sm font-medium truncate">{entry.entity}</p>
                    <p className="text-xs text-muted-foreground truncate">{entry.entity_id ?? "-"}</p>
                  </div>

                  <div className="lg:col-span-2">
                    <ActionBadge action={entry.action} />
                  </div>

                  <div className="lg:col-span-2 min-w-0">
                    <p className="text-xs text-muted-foreground">{t("auditLogs.columns.user")}</p>
                    <p className="text-sm truncate">{entry.profile?.full_name ?? entry.user_id ?? "-"}</p>
                  </div>

                  <div className="lg:col-span-2 min-w-0">
                    <p className="text-xs text-muted-foreground">{t("auditLogs.columns.company")}</p>
                    <p className="text-sm truncate">{entry.company?.name ?? "-"}</p>
                  </div>

                  <div className="lg:col-span-2 min-w-0">
                    <p className="text-xs text-muted-foreground">{t("auditLogs.columns.ip")}</p>
                    <p className="text-sm font-mono truncate">{entry.ip_address ?? "-"}</p>
                  </div>

                  <div className="lg:col-span-2 min-w-0 text-xs text-muted-foreground flex items-center gap-2">
                    <Clock3 className="w-3.5 h-3.5" />
                    <span dir="ltr">{format(new Date(entry.created_at), "MMM dd, yyyy HH:mm")}</span>
                  </div>
                </div>
              ))}
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
    </div>
  );
}
