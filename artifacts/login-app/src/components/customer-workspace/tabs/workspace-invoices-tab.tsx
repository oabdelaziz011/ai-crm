import { FileText, Plus } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { WorkspaceSkeleton } from "@/components/customer-workspace/workspace-ui";
import {
  WorkspaceInlineEmpty,
  WorkspaceStatusChip,
  WorkspaceTabFrame,
} from "@/components/customer-workspace/workspace-tab-frame";
import {
  computeOutstandingBalance,
  filterInvoicesForCustomer,
  fmtCurrency,
  fmtDate,
  invoiceReferenceNumber,
  localizeInvoiceStatus,
} from "@/lib/customer-workspace/customer-workspace-utils";
import type { Customer, Invoice } from "@/lib/types";

type Props = {
  customer: Customer;
  invoices: Invoice[];
  loading?: boolean;
  onNewInvoice: () => void;
  canNewInvoice?: boolean;
};

function invoiceTone(status: string): "muted" | "success" | "warning" | "danger" {
  const key = status.toLowerCase();
  if (key === "paid") return "success";
  if (key === "overdue") return "danger";
  if (key === "unpaid" || key === "issued" || key === "pending") return "warning";
  return "muted";
}

export function WorkspaceInvoicesTab({ customer, invoices, loading, onNewInvoice, canNewInvoice = false }: Props) {
  const { t, i18n } = useTranslation("common");
  const rows = useMemo(() => {
    return filterInvoicesForCustomer(invoices, customer.id).sort(
      (a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime(),
    );
  }, [customer.id, invoices]);
  const outstanding = computeOutstandingBalance(rows);

  if (loading) return <WorkspaceSkeleton rows={6} />;

  return (
    <WorkspaceTabFrame
      title={t("dashboard.customerWorkspace.tabs.invoices")}
      subtitle={
        rows.length
          ? `${t("dashboard.customerWorkspace.invoices.outstanding")}: ${fmtCurrency(outstanding)}`
          : t("dashboard.customerWorkspace.invoices.emptyDescription")
      }
      action={
        canNewInvoice ? (
        <Button size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={onNewInvoice}>
          <Plus className="size-3.5" />
          {t("buttons.newInvoice")}
        </Button>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <WorkspaceInlineEmpty
          icon={FileText}
          title={t("dashboard.customerWorkspace.invoices.emptyTitle")}
          description={t("dashboard.customerWorkspace.invoices.emptyDescription")}
          actionLabel={t("buttons.newInvoice")}
          onAction={onNewInvoice}
        />
      ) : (
        <table className="w-full min-w-[42rem] table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-[24%] px-3 py-2.5 text-start">
                {t("dashboard.customerWorkspace.invoices.colNumber")}
              </th>
              <th className="w-[24%] px-3 py-2.5 text-start">
                {t("dashboard.customerWorkspace.invoices.colAmount")}
              </th>
              <th className="w-[28%] px-3 py-2.5 text-start">
                {t("forms.invoice.invoiceDate")}
              </th>
              <th className="w-[24%] px-3 py-2.5 text-start">
                {t("forms.invoice.status")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inv: Invoice) => (
              <tr key={inv.id} className="border-b border-border/40 hover:bg-primary/5">
                <td className="px-3 py-2.5 text-start text-muted-foreground">
                  <span dir="ltr" className="inline-block font-mono text-xs tabular-nums">
                    {invoiceReferenceNumber(inv)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-start font-medium tabular-nums">
                  {fmtCurrency(Number(inv.amount))}
                </td>
                <td className="px-3 py-2.5 text-start text-muted-foreground tabular-nums">
                  {fmtDate(inv.invoice_date, i18n.language)}
                </td>
                <td className="px-3 py-2.5 text-start">
                  <WorkspaceStatusChip tone={invoiceTone(inv.status)}>
                    {localizeInvoiceStatus(inv.status, (key) => t(key))}
                  </WorkspaceStatusChip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </WorkspaceTabFrame>
  );
}
