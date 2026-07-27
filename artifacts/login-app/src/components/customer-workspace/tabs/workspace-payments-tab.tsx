import { CreditCard, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  WorkspaceEmptyState,
  WorkspaceListRow,
  WorkspaceSection,
  WorkspaceSkeleton,
} from "@/components/customer-workspace/workspace-ui";
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
  const { t } = useTranslation("common");
  const paid = filterInvoicesForCustomer(invoices, customerId).filter((inv) => inv.status === "Paid");

  if (loading) return <WorkspaceSkeleton rows={5} />;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <WorkspaceSection title={t("dashboard.customerWorkspace.payments.history")}>
        {paid.length === 0 ? (
          <WorkspaceEmptyState
            icon={CreditCard}
            title={t("dashboard.customerWorkspace.payments.emptyTitle")}
            description={t("dashboard.customerWorkspace.payments.emptyDescription")}
          />
        ) : (
          <div className="space-y-2">
            {paid.map((inv) => (
              <WorkspaceListRow
                key={inv.id}
                title={fmtCurrency(Number(inv.amount))}
                subtitle={fmtDate(inv.invoice_date)}
                badge={t("status.paid")}
              />
            ))}
          </div>
        )}
      </WorkspaceSection>

      <WorkspaceSection title={t("dashboard.customerWorkspace.payments.refunds")}>
        <WorkspaceEmptyState
          icon={RotateCcw}
          title={t("dashboard.customerWorkspace.payments.noRefundsTitle")}
          description={t("dashboard.customerWorkspace.payments.noRefundsDescription")}
        />
      </WorkspaceSection>

      <WorkspaceSection title={t("dashboard.customerWorkspace.payments.methods")}>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.customerWorkspace.payments.methodsHint")}
        </p>
      </WorkspaceSection>
    </div>
  );
}
