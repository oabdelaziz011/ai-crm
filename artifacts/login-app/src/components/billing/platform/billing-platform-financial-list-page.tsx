import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BillingEmptyState } from "@/components/billing/ui/billing-empty-state";
import { BillingPagination } from "@/components/billing/ui/billing-pagination";
import { BillingToolbar } from "@/components/billing/ui/billing-toolbar";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePlatformFinancialListPaged } from "@/hooks/billing/use-platform-financial-list";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  billingNotAvailable,
  translateInvoiceStatus,
  translatePaymentStatus,
} from "@/lib/billing/billing-display-i18n";
import { canViewBilling } from "@/lib/billing/billing-permissions";
import { formatBillingCurrency, formatBillingDate } from "@/lib/billing/format";
import type { PlatformFinancialListType } from "@/lib/billing/platform-financial-list";

const PAGE_SIZE = 15;

type ListConfig = {
  listType: PlatformFinancialListType;
  titleKey: string;
  subtitleKey: string;
  searchPlaceholderKey: string;
  emptyKey: string;
  columns: { key: string; labelKey: string }[];
};

export function BillingPlatformFinancialListPage({ config }: { config: ListConfig }) {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canView = canViewBilling(hasPermission, isSuperAdmin);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const offset = (page - 1) * PAGE_SIZE;
  const showStatusFilter = config.listType === "payments" || config.listType === "invoices";

  const { data, isLoading, error } = usePlatformFinancialListPaged(config.listType, {
    enabled: canView,
    limit: PAGE_SIZE,
    offset,
    search,
    status: showStatusFilter ? status : null,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!canView) {
    return <p className="text-sm text-muted-foreground">{t("billing.noPermission")}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t(config.titleKey)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t(config.subtitleKey)}</p>
      </div>

      {error ? <DashboardErrorBanner message={error.message} /> : null}

      <DashboardCard className="overflow-hidden">
        <BillingToolbar
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder={t(config.searchPlaceholderKey)}
          filters={
            showStatusFilter ? (
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
              >
                <option value="all">{t("billing.filters.allStatuses")}</option>
                {config.listType === "payments" ? (
                  <>
                    <option value="succeeded">{t("billing.paymentStatus.succeeded")}</option>
                    <option value="failed">{t("billing.paymentStatus.failed")}</option>
                    <option value="pending">{t("billing.paymentStatus.pending")}</option>
                  </>
                ) : (
                  <>
                    <option value="paid">{t("billing.invoiceStatus.paid")}</option>
                    <option value="issued">{t("billing.invoiceStatus.issued")}</option>
                    <option value="overdue">{t("billing.invoiceStatus.overdue")}</option>
                  </>
                )}
              </select>
            ) : null
          }
        />

        {isLoading ? (
          <DashboardTableSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <BillingEmptyState title={t(config.emptyKey)} description={t("billing.emptyHint")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {config.columns.map((col) => (
                    <TableHead key={col.key}>{t(col.labelKey)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => {
                  const company = row.company as { name?: string } | undefined;
                  return (
                    <TableRow key={String(row.id ?? index)}>
                      {config.columns.map((col) => (
                        <TableCell key={col.key}>{renderCell(col.key, row, company?.name)}</TableCell>
                      ))}
                    </TableRow>
                  );
                })}
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
    </div>
  );

  function renderCell(key: string, row: Record<string, unknown>, companyName?: string) {
    switch (key) {
      case "company":
        return companyName ?? billingNotAvailable(t);
      case "number":
        return String(row.invoice_number ?? row.receipt_number ?? row.provider_payment_id ?? billingNotAvailable(t));
      case "amount":
        return formatBillingCurrency(Number(row.amount ?? row.total_amount ?? 0), String(row.currency ?? ""));
      case "status": {
        const status = String(row.status ?? "");
        if (!status) return billingNotAvailable(t);
        if (config.listType === "payments" || config.listType === "failures") {
          return translatePaymentStatus(t, status);
        }
        if (config.listType === "invoices") {
          return translateInvoiceStatus(t, status);
        }
        return status;
      }
      case "date":
        return formatBillingDate(
          String(row.created_at ?? row.issued_at ?? row.next_renewal_at ?? row.current_period_end ?? ""),
        );
      case "plan":
        return String(row.plan_name ?? billingNotAvailable(t));
      case "provider":
        return String(row.provider ?? billingNotAvailable(t));
      case "failure":
        return String(row.failure_message ?? row.failure_code ?? billingNotAvailable(t));
      default:
        return billingNotAvailable(t);
    }
  }
}
