import { useMemo, useState } from "react";
import { ArrowUpDown, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BillingEmptyState } from "@/components/billing/ui/billing-empty-state";
import { BillingToolbar } from "@/components/billing/ui/billing-toolbar";
import { DashboardCard, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBillingReceipts } from "@/hooks/billing/use-billing-receipts";
import { billingNotAvailable } from "@/lib/billing/billing-display-i18n";
import { downloadCsv } from "@/lib/billing/export-csv";
import { formatBillingCurrency, formatBillingDate } from "@/lib/billing/format";
import type { BillingReceipt } from "@/lib/billing/types";

type SortKey = "receipt_number" | "amount" | "issued_at";

type ReceiptHistoryPanelProps = {
  companyId: string;
  enabled?: boolean;
};

export function ReceiptHistoryPanel({ companyId, enabled = true }: ReceiptHistoryPanelProps) {
  const { t } = useTranslation("common");
  const { data: receipts = [], isLoading, error } = useBillingReceipts(companyId, enabled);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("issued_at");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return receipts
      .filter((row) => {
        return (
          !q ||
          row.receipt_number.toLowerCase().includes(q) ||
          (row.payment_method_label ?? "").toLowerCase().includes(q)
        );
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
  }, [receipts, search, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === "receipt_number");
    }
  };

  const handleExport = () => {
    downloadCsv(
      `billing-receipts-${companyId.slice(0, 8)}.csv`,
      [
        t("billing.tables.receiptNumber"),
        t("billing.tables.method"),
        t("billing.tables.amount"),
        t("billing.tables.issuedAt"),
      ],
      filtered.map((row) => [
        row.receipt_number,
        row.payment_method_label ?? "",
        String(row.amount),
        row.issued_at,
      ]),
    );
  };

  return (
    <DashboardCard className="overflow-hidden">
      <BillingToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("billing.detail.receiptSearch")}
        onExport={handleExport}
        exportLabel={t("billing.actions.export")}
        exportDisabled={filtered.length === 0}
      />

      {error ? (
        <p className="p-4 text-sm text-destructive">{error.message}</p>
      ) : isLoading ? (
        <DashboardTableSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <BillingEmptyState title={t("billing.detail.noReceipts")} icon={Receipt} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("receipt_number")}>
                    {t("billing.tables.receiptNumber")} <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>{t("billing.tables.method")}</TableHead>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("amount")}>
                    {t("billing.tables.amount")} <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("issued_at")}>
                    {t("billing.tables.issuedAt")} <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </TableHead>
                <TableHead className="text-end">{t("billing.tables.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row: BillingReceipt) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.receipt_number}</TableCell>
                  <TableCell>{row.payment_method_label ?? billingNotAvailable(t)}</TableCell>
                  <TableCell>{formatBillingCurrency(row.amount, row.currency)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatBillingDate(row.issued_at, true)}</TableCell>
                  <TableCell className="text-end">
                    {row.document_url ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={row.document_url} target="_blank" rel="noreferrer">
                          {t("billing.actions.download")}
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </DashboardCard>
  );
}
