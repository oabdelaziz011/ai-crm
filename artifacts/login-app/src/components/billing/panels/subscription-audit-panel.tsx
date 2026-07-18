import { useState } from "react";
import { Eye, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BillingJsonDiffViewer } from "@/components/billing/audit/billing-json-diff-viewer";
import { BillingEmptyState } from "@/components/billing/ui/billing-empty-state";
import { BillingPagination } from "@/components/billing/ui/billing-pagination";
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
import { useBillingAuditLogPaged } from "@/hooks/billing/use-billing-audit-log";
import { translateAuditSource } from "@/lib/billing/billing-display-i18n";
import { formatBillingDate } from "@/lib/billing/format";
import type { BillingAuditLog } from "@/lib/billing/types";

const PAGE_SIZE = 10;

type SubscriptionAuditPanelProps = {
  companyId: string;
  enabled?: boolean;
};

export function SubscriptionAuditPanel({ companyId, enabled = true }: SubscriptionAuditPanelProps) {
  const { t } = useTranslation("common");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<BillingAuditLog | null>(null);

  const offset = (page - 1) * PAGE_SIZE;
  const { data, isLoading, error } = useBillingAuditLogPaged({
    enabled,
    limit: PAGE_SIZE,
    offset,
    companyId,
  });

  const logs = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <DashboardCard className="overflow-hidden">
      <div className="border-b border-white/5 p-5">
        <h2 className="font-semibold">{t("billing.detail.audit")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("billing.detail.auditHint")}</p>
      </div>

      {error ? <DashboardErrorBanner message={error.message} /> : null}

      {isLoading ? (
        <DashboardTableSkeleton rows={6} />
      ) : logs.length === 0 ? (
        <BillingEmptyState title={t("billing.detail.noAudit")} icon={ShieldCheck} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("billing.audit.columns.event")}</TableHead>
                <TableHead>{t("billing.audit.columns.source")}</TableHead>
                <TableHead>{t("billing.audit.columns.time")}</TableHead>
                <TableHead className="text-end">{t("billing.tables.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{log.event_type}</TableCell>
                  <TableCell>{translateAuditSource(t, log.source)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatBillingDate(log.occurred_at, true)}
                  </TableCell>
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

      {logs.length > 0 ? (
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
      ) : null}

      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedLog?.event_type}</DialogTitle>
          </DialogHeader>
          {selectedLog ? (
            <div className="space-y-4">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">{t("billing.audit.columns.source")}:</span>{" "}
                  {translateAuditSource(t, selectedLog.source)}
                </p>
                <p>
                  <span className="text-muted-foreground">{t("billing.audit.columns.time")}:</span>{" "}
                  {formatBillingDate(selectedLog.occurred_at, true)}
                </p>
              </div>
              <BillingJsonDiffViewer before={selectedLog.previous_value} after={selectedLog.new_value} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardCard>
  );
}
