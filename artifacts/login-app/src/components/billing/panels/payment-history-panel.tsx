import { useMemo, useState } from "react";
import { ArrowUpDown, CreditCard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BillingDocumentStatusBadge } from "@/components/billing/status/billing-document-status-badge";
import { BillingEmptyState } from "@/components/billing/ui/billing-empty-state";
import { BillingToolbar } from "@/components/billing/ui/billing-toolbar";
import { DashboardCard, DashboardTableSkeleton } from "@/components/dashboard/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBillingPayments } from "@/hooks/billing/use-billing-payments";
import { billingNotAvailable } from "@/lib/billing/billing-display-i18n";
import { downloadCsv } from "@/lib/billing/export-csv";
import { formatBillingCurrency, formatBillingDate } from "@/lib/billing/format";
import type { BillingPayment } from "@/lib/billing/types";

type SortKey = "amount" | "status" | "paid_at" | "provider";

type PaymentHistoryPanelProps = {
  companyId: string;
  enabled?: boolean;
};

export function PaymentHistoryPanel({ companyId, enabled = true }: PaymentHistoryPanelProps) {
  const { t } = useTranslation("common");
  const { data: payments = [], isLoading, error } = useBillingPayments(companyId, enabled);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("paid_at");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return payments
      .filter((row) => {
        const matchesSearch =
          !q ||
          (row.provider ?? "").toLowerCase().includes(q) ||
          (row.payment_method_label ?? "").toLowerCase().includes(q) ||
          row.status.toLowerCase().includes(q);
        const matchesStatus = statusFilter === "all" || row.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") {
          return sortAsc ? av - bv : bv - av;
        }
        return sortAsc
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
  }, [payments, search, statusFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const handleExport = () => {
    downloadCsv(
      `billing-payments-${companyId.slice(0, 8)}.csv`,
      [
        t("billing.tables.method"),
        t("billing.tables.provider"),
        t("billing.tables.status"),
        t("billing.tables.amount"),
        t("billing.tables.paidAt"),
      ],
      filtered.map((row) => [
        row.payment_method_label ?? "",
        row.provider ?? "",
        row.status,
        String(row.amount),
        row.paid_at ?? "",
      ]),
    );
  };

  return (
    <DashboardCard className="overflow-hidden">
      <BillingToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("billing.detail.paymentSearch")}
        onExport={handleExport}
        exportLabel={t("billing.actions.export")}
        exportDisabled={filtered.length === 0}
        filters={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
          >
            <option value="all">{t("billing.filters.allStatuses")}</option>
            <option value="succeeded">{t("billing.paymentStatus.succeeded")}</option>
            <option value="pending">{t("billing.paymentStatus.pending")}</option>
            <option value="processing">{t("billing.paymentStatus.processing")}</option>
            <option value="failed">{t("billing.paymentStatus.failed")}</option>
            <option value="refunded">{t("billing.paymentStatus.refunded")}</option>
          </select>
        }
      />

      {error ? (
        <p className="p-4 text-sm text-destructive">{error.message}</p>
      ) : isLoading ? (
        <DashboardTableSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <BillingEmptyState title={t("billing.detail.noPayments")} icon={CreditCard} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("billing.tables.method")}</TableHead>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("provider")}>
                    {t("billing.tables.provider")} <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("status")}>
                    {t("billing.tables.status")} <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("amount")}>
                    {t("billing.tables.amount")} <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("paid_at")}>
                    {t("billing.tables.paidAt")} <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row: BillingPayment) => (
                <TableRow key={row.id}>
                  <TableCell>{row.payment_method_label ?? billingNotAvailable(t)}</TableCell>
                  <TableCell>{row.provider ?? billingNotAvailable(t)}</TableCell>
                  <TableCell>
                    <BillingDocumentStatusBadge status={row.status} label={t(`billing.paymentStatus.${row.status}`)} />
                  </TableCell>
                  <TableCell>{formatBillingCurrency(row.amount, row.currency)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatBillingDate(row.paid_at ?? row.created_at, true)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </DashboardCard>
  );
}
