import { useMemo, useState } from "react";
import { ArrowUpDown, FileText } from "lucide-react";
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
import { useBillingInvoices } from "@/hooks/billing/use-billing-invoices";
import { downloadCsv } from "@/lib/billing/export-csv";
import { formatBillingCurrency, formatBillingDate } from "@/lib/billing/format";
import type { BillingInvoice } from "@/lib/billing/types";

type SortKey = "invoice_number" | "status" | "total_amount" | "issued_at";

type InvoiceHistoryPanelProps = {
  companyId: string;
  enabled?: boolean;
};

export function InvoiceHistoryPanel({ companyId, enabled = true }: InvoiceHistoryPanelProps) {
  const { t } = useTranslation("common");
  const { data: invoices = [], isLoading, error } = useBillingInvoices(companyId, enabled);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("issued_at");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices
      .filter((row) => {
        const matchesSearch =
          !q ||
          row.invoice_number.toLowerCase().includes(q) ||
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
  }, [invoices, search, statusFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === "invoice_number");
    }
  };

  const handleExport = () => {
    downloadCsv(
      `billing-invoices-${companyId.slice(0, 8)}.csv`,
      [
        t("billing.tables.invoiceNumber"),
        t("billing.tables.status"),
        t("billing.tables.amount"),
        t("billing.tables.issuedAt"),
        t("billing.tables.paidAt"),
      ],
      filtered.map((row) => [
        row.invoice_number,
        row.status,
        String(row.total_amount),
        row.issued_at ?? "",
        row.paid_at ?? "",
      ]),
    );
  };

  return (
    <DashboardCard className="overflow-hidden">
      <BillingToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("billing.detail.invoiceSearch")}
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
            <option value="draft">{t("billing.invoiceStatus.draft")}</option>
            <option value="issued">{t("billing.invoiceStatus.issued")}</option>
            <option value="paid">{t("billing.invoiceStatus.paid")}</option>
            <option value="overdue">{t("billing.invoiceStatus.overdue")}</option>
            <option value="void">{t("billing.invoiceStatus.void")}</option>
          </select>
        }
      />

      {error ? (
        <p className="p-4 text-sm text-destructive">{error.message}</p>
      ) : isLoading ? (
        <DashboardTableSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <BillingEmptyState title={t("billing.detail.noInvoices")} icon={FileText} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("invoice_number")}>
                    {t("billing.tables.invoiceNumber")} <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("status")}>
                    {t("billing.tables.status")} <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("total_amount")}>
                    {t("billing.tables.amount")} <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>{t("billing.tables.period")}</TableHead>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("issued_at")}>
                    {t("billing.tables.issuedAt")} <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row: BillingInvoice) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.invoice_number}</TableCell>
                  <TableCell>
                    <BillingDocumentStatusBadge status={row.status} label={t(`billing.invoiceStatus.${row.status}`)} />
                  </TableCell>
                  <TableCell>{formatBillingCurrency(row.total_amount, row.currency)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatBillingDate(row.period_start)} – {formatBillingDate(row.period_end)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatBillingDate(row.issued_at, true)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </DashboardCard>
  );
}
