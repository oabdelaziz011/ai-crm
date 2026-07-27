import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  DollarSign, CheckCircle2, Clock, AlertCircle, Plus, Download, FileText, Pencil, Trash2,
} from "lucide-react";
import { useCustomerProfile } from "@/context/customer-profile-context";
import { useAuth } from "@/context/auth-context";
import { useInvoices, useDeleteInvoice } from "@/hooks/use-invoices";
import { useCustomers } from "@/hooks/use-customers";
import { InvoiceModal } from "@/components/dashboard/invoice-modal";
import { DeleteDialog } from "@/components/dashboard/delete-dialog";
import { Can } from "@/components/rbac/permission-guard";
import { useHasPermission } from "@/hooks/use-rbac";
import type { Invoice } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { useRegisterFloatingAiContext } from "@/context/floating-ai-context";
import {
  DashboardCard,
  DashboardStatCard,
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";

export default function InvoicesPage() {
  const { t } = useTranslation("common");
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { openCustomerProfile } = useCustomerProfile();
  const { data: invoices = [], isLoading, error } = useInvoices();
  const { data: customers = [] } = useCustomers();
  const deleteInvoice = useDeleteInvoice();
  const canCreateInvoices = useHasPermission("invoices.create");
  const canEditInvoices = useHasPermission("invoices.edit");
  const canDeleteInvoices = useHasPermission("invoices.delete");
  const [modal, setModal] = useState<{ open: boolean; invoice?: Invoice | null }>({ open: false });
  const [del, setDel] = useState<Invoice | null>(null);

  const totalBilled   = invoices.reduce<number>((sum: number, invoice: Invoice) => sum + Number(invoice.amount), 0);
  const totalPaid     = invoices.filter((invoice: Invoice) => invoice.status === "Paid").reduce<number>((sum: number, invoice: Invoice) => sum + Number(invoice.amount), 0);
  const totalUnpaid   = invoices.filter((invoice: Invoice) => invoice.status === "Unpaid").reduce<number>((sum: number, invoice: Invoice) => sum + Number(invoice.amount), 0);
  const totalOverdue  = invoices.filter((invoice: Invoice) => invoice.status === "Overdue").reduce<number>((sum: number, invoice: Invoice) => sum + Number(invoice.amount), 0);

  const floatingAiContext = useMemo(
    () => ({
      page: "invoices" as const,
      moduleLabel: t("navigation.invoices"),
      pageTitle: t("dashboard.invoices.title"),
      filters: {
        totalBilled,
        totalUnpaid,
        totalOverdue,
        count: invoices.length,
      },
      selectedInvoice: modal.invoice
        ? { id: modal.invoice.id, label: `INV-${modal.invoice.id.slice(0, 8).toUpperCase()}` }
        : null,
      currentEntity: modal.invoice
        ? {
            type: "invoice" as const,
            id: modal.invoice.id,
            label: `INV-${modal.invoice.id.slice(0, 8).toUpperCase()}`,
            reference: `INV-${modal.invoice.id.slice(0, 8).toUpperCase()}`,
          }
        : null,
    }),
    [t, modal.invoice, invoices.length, totalBilled, totalUnpaid, totalOverdue],
  );

  useRegisterFloatingAiContext(floatingAiContext);

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("dashboard.invoices.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dashboard.invoices.subtitle")}</p>
        </div>
        <Can permission="invoices.create">
          <Button onClick={() => setModal({ open: true, invoice: null })} className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary gap-2">
            <Plus className="w-4 h-4" /> {t("buttons.newInvoice")}
          </Button>
        </Can>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardStatCard label={t("dashboard.invoices.stats.totalBilled")}   value={fmt(totalBilled)}  icon={DollarSign}   loading={isLoading} />
        <DashboardStatCard label={t("dashboard.invoices.stats.paid")}           value={fmt(totalPaid)}    icon={CheckCircle2} loading={isLoading} />
        <DashboardStatCard label={t("dashboard.invoices.stats.outstanding")}    value={fmt(totalUnpaid)}  icon={Clock}        loading={isLoading} />
        <DashboardStatCard label={t("dashboard.invoices.stats.overdue")}        value={fmt(totalOverdue)} icon={AlertCircle}  loading={isLoading} />
      </div>

      {error && <DashboardErrorBanner message={error.message} />}

      <DashboardCard className="overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-sm">{t("dashboard.invoices.all")}</h3>
          <Button variant="outline" size="sm" className="border-white/10 text-xs gap-2">
            <Download className="w-3.5 h-3.5" /> {t("buttons.export")}
          </Button>
        </div>
        {isLoading ? <DashboardTableSkeleton /> : invoices.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            {t("dashboard.invoices.empty")}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {invoices.map((invoice: Invoice) => (
              <div key={invoice.id} className="flex items-center px-6 py-4 hover:bg-white/[0.02] transition-colors gap-4">
                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    className="text-sm font-medium text-left hover:text-primary transition-colors truncate block w-full"
                    disabled={!invoice.customer_id}
                    onClick={() => {
                      if (!invoice.customer_id) return;
                      openCustomerProfile({
                        customerId: invoice.customer_id,
                        context: { companyId },
                      });
                    }}
                  >
                    {invoice.customers?.name ?? "—"}
                  </button>
                  <p className="text-xs text-muted-foreground font-mono">
                    <span dir="ltr">{format(new Date(invoice.invoice_date), "MMM dd, yyyy")}</span>
                  </p>
                </div>
                <p className="text-sm font-mono font-bold">{fmt(Number(invoice.amount))}</p>
                <span className={`text-xs font-mono px-2.5 py-1 rounded-full border ${
                  invoice.status === "Paid"    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                  invoice.status === "Unpaid"  ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
                                             "border-rose-500/30 bg-rose-500/10 text-rose-400"
                }`}>{t(`status.${invoice.status.toLowerCase()}`)}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {canEditInvoices && (
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setModal({ open: true, invoice })}>
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  )}
                  {canDeleteInvoices && (
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setDel(invoice)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      <InvoiceModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        invoice={modal.invoice}
        customers={customers}
      />
      <DeleteDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => {
          if (!del || !canDeleteInvoices) return;
          deleteInvoice.mutate(del.id, { onSuccess: () => setDel(null) });
        }}
        isPending={deleteInvoice.isPending}
        itemName={t("navigation.invoices")}
      />
    </div>
  );
}
