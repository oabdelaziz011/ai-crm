import { useState } from "react";
import { ArrowUpDown, Eye, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CompanyLogo } from "@/components/billing/identity/company-logo";
import { BillingJsonDiffViewer } from "@/components/billing/audit/billing-json-diff-viewer";
import { BillingEmptyState } from "@/components/billing/ui/billing-empty-state";
import { BillingKpiGrid } from "@/components/billing/ui/billing-kpi-grid";
import { BillingPagination } from "@/components/billing/ui/billing-pagination";
import { BillingToolbar } from "@/components/billing/ui/billing-toolbar";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBillingAuditEventTypes } from "@/hooks/billing/use-billing-audit-event-types";
import { useBillingAuditLogPaged } from "@/hooks/billing/use-billing-audit-log";
import { useToast } from "@/hooks/use-toast";
import { useAuthUser } from "@/hooks/use-rbac";
import { billingNotAvailable, translateAuditSource } from "@/lib/billing/billing-display-i18n";
import { canExportBillingAudit, canViewBillingAudit } from "@/lib/billing/billing-permissions";
import { downloadCsv } from "@/lib/billing/export-csv";
import { fetchBillingAuditLogsForExport } from "@/lib/billing/fetch-export-data";
import { formatBillingDate } from "@/lib/billing/format";
import type { BillingAuditLog } from "@/lib/billing/types";

const PAGE_SIZE = 15;

export function BillingAuditLogPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canView = canViewBillingAudit(hasPermission, isSuperAdmin);
  const canExport = canExportBillingAudit(hasPermission, isSuperAdmin);
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<BillingAuditLog | null>(null);
  const [exporting, setExporting] = useState(false);

  const offset = (page - 1) * PAGE_SIZE;
  const { data, isLoading, error } = useBillingAuditLogPaged({
    enabled: canView,
    limit: PAGE_SIZE,
    offset,
    search,
    eventType,
  });
  const { data: eventTypes = [] } = useBillingAuditEventTypes(canView);

  const logs = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const stats = data?.stats ?? { total, manual: 0, system: 0, api: 0 };

  const handleExport = async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      const exportRows = await fetchBillingAuditLogsForExport({ search, eventType });
      downloadCsv(
        "billing-audit-log.csv",
        [
          t("billing.audit.columns.event"),
          t("billing.audit.columns.company"),
          t("billing.audit.columns.source"),
          t("billing.audit.columns.time"),
          t("billing.audit.before"),
          t("billing.audit.after"),
        ],
        exportRows.map((log) => [
          log.event_type,
          log.company?.name ?? t("billing.audit.platformScope"),
          log.source,
          log.occurred_at,
          JSON.stringify(log.previous_value ?? {}),
          JSON.stringify(log.new_value ?? {}),
        ]),
      );
    } catch (exportError) {
      const message =
        exportError instanceof Error ? exportError.message : t("billing.audit.exportFailed");
      toast({
        variant: "destructive",
        title: t("billing.toast.errorTitle"),
        description: message,
      });
    } finally {
      setExporting(false);
    }
  };

  if (!canView) {
    return <p className="text-sm text-muted-foreground">{t("billing.audit.noPermission")}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("billing.audit.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("billing.audit.subtitle")}</p>
      </div>

      <BillingKpiGrid
        loading={isLoading}
        items={[
          { key: "total", label: t("billing.audit.stats.total"), value: stats.total, icon: ShieldCheck },
          { key: "manual", label: t("billing.audit.stats.manual"), value: stats.manual, icon: ShieldCheck },
          { key: "system", label: t("billing.audit.stats.system"), value: stats.system, icon: ShieldCheck },
          { key: "api", label: t("billing.audit.stats.api"), value: stats.api, icon: ShieldCheck },
        ]}
      />

      {error ? <DashboardErrorBanner message={error.message} /> : null}
      {data?.degraded && data.degradedMessage ? (
        <DashboardErrorBanner message={data.degradedMessage} />
      ) : null}

      <DashboardCard className="overflow-hidden">
        <BillingToolbar
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder={t("billing.audit.searchPlaceholder")}
          onExport={canExport ? handleExport : undefined}
          exportLabel={exporting ? t("billing.actions.exporting") : t("billing.actions.export")}
          exportDisabled={exporting || total === 0}
          filters={
            <select
              value={eventType}
              onChange={(e) => {
                setEventType(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            >
              <option value="all">{t("billing.filters.allEventTypes")}</option>
              {eventTypes.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.label}
                </option>
              ))}
            </select>
          }
        />

        {isLoading ? (
          <DashboardTableSkeleton rows={8} />
        ) : logs.length === 0 ? (
          <BillingEmptyState title={t("billing.audit.empty")} description={t("billing.audit.emptyHint")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("billing.audit.columns.event")}</TableHead>
                  <TableHead>{t("billing.audit.columns.company")}</TableHead>
                  <TableHead>{t("billing.audit.columns.source")}</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">
                      {t("billing.audit.columns.time")} <ArrowUpDown className="h-3.5 w-3.5" />
                    </span>
                  </TableHead>
                  <TableHead className="text-end">{t("billing.tables.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">{log.event_type}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {log.company ? (
                          <CompanyLogo name={log.company.name ?? billingNotAvailable(t)} logoUrl={log.company.logo_url} />
                        ) : null}
                        <span>{log.company?.name ?? t("billing.audit.platformScope")}</span>
                      </div>
                    </TableCell>
                    <TableCell>{translateAuditSource(t, log.source)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatBillingDate(log.occurred_at, true)}</TableCell>
                    <TableCell className="text-end">
                      <Button variant="ghost" size="icon" onClick={() => setSelectedLog(log)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <BillingPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageInfoLabel={t("billing.pagination.pageInfo", { page, totalPages, total })}
          previousLabel={t("billing.pagination.previous")}
          nextLabel={t("billing.pagination.next")}
          onPrevious={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      </DashboardCard>

      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedLog?.event_type}</DialogTitle>
          </DialogHeader>
          {selectedLog ? (
            <div className="space-y-4">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p><span className="text-muted-foreground">{t("billing.audit.columns.company")}:</span> {selectedLog.company?.name ?? t("billing.audit.platformScope")}</p>
                <p><span className="text-muted-foreground">{t("billing.audit.columns.source")}:</span> {translateAuditSource(t, selectedLog.source)}</p>
                <p><span className="text-muted-foreground">{t("billing.audit.columns.time")}:</span> {formatBillingDate(selectedLog.occurred_at, true)}</p>
                {selectedLog.ip_address ? (
                  <p><span className="text-muted-foreground">{t("billing.audit.ipAddress")}:</span> {selectedLog.ip_address}</p>
                ) : null}
              </div>
              <BillingJsonDiffViewer
                before={selectedLog.previous_value}
                after={selectedLog.new_value}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{t("billing.audit.rawBefore")}</p>
                  <pre className="max-h-48 overflow-auto rounded-xl border border-white/5 bg-black/20 p-3 text-xs">
                    {JSON.stringify(selectedLog.previous_value, null, 2) || billingNotAvailable(t)}
                  </pre>
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{t("billing.audit.rawAfter")}</p>
                  <pre className="max-h-48 overflow-auto rounded-xl border border-white/5 bg-black/20 p-3 text-xs">
                    {JSON.stringify(selectedLog.new_value, null, 2) || billingNotAvailable(t)}
                  </pre>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
