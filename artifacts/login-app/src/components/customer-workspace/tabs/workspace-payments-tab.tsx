import { CreditCard } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { WorkspaceSkeleton } from "@/components/customer-workspace/workspace-ui";
import {
  WorkspaceInlineEmpty,
  WorkspaceStatusChip,
  WorkspaceTabFrame,
} from "@/components/customer-workspace/workspace-tab-frame";
import {
  filterInvoicesForCustomer,
  fmtCurrency,
  fmtDate,
} from "@/lib/customer-workspace/customer-workspace-utils";
import type { Invoice } from "@/lib/types";

type Props = {
  customerId: string;
  invoices: Invoice[];
  loading?: boolean;
};

export function WorkspacePaymentsTab({ customerId, invoices, loading }: Props) {
  const { t, i18n } = useTranslation("common");
  const paid = useMemo(
    () =>
      filterInvoicesForCustomer(invoices, customerId)
        .filter((inv) => inv.status === "Paid")
        .sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime()),
    [customerId, invoices],
  );

  if (loading) return <WorkspaceSkeleton rows={5} />;

  return (
    <WorkspaceTabFrame
      title={t("dashboard.customerWorkspace.payments.history")}
      subtitle={t("dashboard.customers.list.rowCount", { count: paid.length })}
    >
      {paid.length === 0 ? (
        <WorkspaceInlineEmpty
          icon={CreditCard}
          title={t("dashboard.customerWorkspace.payments.emptyTitle")}
          description={t("dashboard.customerWorkspace.payments.emptyDescription")}
        />
      ) : (
        <table className="w-full min-w-[32rem] table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-[34%] px-3 py-2.5 text-start">{t("dashboard.customerWorkspace.invoices.colAmount")}</th>
              <th className="w-[40%] px-3 py-2.5 text-start">{t("forms.invoice.invoiceDate")}</th>
              <th className="w-[26%] px-3 py-2.5 text-start">{t("forms.invoice.status")}</th>
            </tr>
          </thead>
          <tbody>
            {paid.map((inv) => (
              <tr key={inv.id} className="border-b border-border/40 hover:bg-primary/5">
                <td className="px-3 py-2.5 text-start font-medium tabular-nums">{fmtCurrency(Number(inv.amount))}</td>
                <td className="px-3 py-2.5 text-start text-muted-foreground tabular-nums">
                  {fmtDate(inv.invoice_date, i18n.language)}
                </td>
                <td className="px-3 py-2.5 text-start">
                  <WorkspaceStatusChip tone="success">{t("status.paid")}</WorkspaceStatusChip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </WorkspaceTabFrame>
  );
}
