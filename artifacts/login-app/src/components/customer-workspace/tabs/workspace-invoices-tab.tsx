import { FileText, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  WorkspaceEmptyState,
  WorkspaceListRow,
  WorkspaceSection,
  WorkspaceSkeleton,
  WorkspaceMetric,
} from "@/components/customer-workspace/workspace-ui";
import {
  computeOutstandingBalance,
  filterInvoicesForCustomer,
  fmtCurrency,
  fmtDate,
  groupInvoices,
} from "@/lib/customer-workspace/customer-workspace-utils";
import type { Customer, Invoice } from "@/lib/types";

type Props = {
  customer: Customer;
  invoices: Invoice[];
  loading?: boolean;
  onNewInvoice: () => void;
};

export function WorkspaceInvoicesTab({ customer, invoices, loading, onNewInvoice }: Props) {
  const { t } = useTranslation("common");
  const customerInvoices = filterInvoicesForCustomer(invoices, customer.id);
  const groups = groupInvoices(customerInvoices);
  const outstanding = computeOutstandingBalance(customerInvoices);

  if (loading) return <WorkspaceSkeleton rows={6} />;

  if (customerInvoices.length === 0) {
    return (
      <WorkspaceEmptyState
        icon={FileText}
        title={t("dashboard.customerWorkspace.invoices.emptyTitle")}
        description={t("dashboard.customerWorkspace.invoices.emptyDescription")}
        action={
          <Button size="sm" className="gap-2" onClick={onNewInvoice}>
            <Plus className="size-4" />
            {t("buttons.newInvoice")}
          </Button>
        }
      />
    );
  }

  const renderGroup = (title: string, items: Invoice[], empty: string) => (
    <WorkspaceSection title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map((inv) => (
            <WorkspaceListRow
              key={inv.id}
              title={fmtCurrency(Number(inv.amount))}
              subtitle={fmtDate(inv.invoice_date)}
              badge={inv.status}
            />
          ))}
        </div>
      )}
    </WorkspaceSection>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <WorkspaceMetric
          label={t("dashboard.customerWorkspace.invoices.outstanding")}
          value={fmtCurrency(outstanding)}
          accent={outstanding > 0 ? "warning" : undefined}
        />
        <Button size="sm" className="gap-2 shrink-0" onClick={onNewInvoice}>
          <Plus className="size-4" />
          {t("buttons.newInvoice")}
        </Button>
      </div>
      {renderGroup(
        t("dashboard.customerWorkspace.invoices.outstanding"),
        groups.outstanding,
        t("dashboard.customerWorkspace.invoices.noOutstanding"),
      )}
      {renderGroup(
        t("dashboard.customerWorkspace.invoices.paid"),
        groups.paid,
        t("dashboard.customerWorkspace.invoices.noPaid"),
      )}
      {renderGroup(
        t("dashboard.customerWorkspace.invoices.overdue"),
        groups.overdue,
        t("dashboard.customerWorkspace.invoices.noOverdue"),
      )}
      {renderGroup(
        t("dashboard.customerWorkspace.invoices.draft"),
        groups.draft,
        t("dashboard.customerWorkspace.invoices.noDraft"),
      )}
    </div>
  );
}
