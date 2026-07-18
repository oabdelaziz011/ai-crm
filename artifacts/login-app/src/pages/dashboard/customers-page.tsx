import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Users, TrendingUp, Mail, Phone, Plus, Filter, Search, Pencil, Trash2,
} from "lucide-react";
import { useCustomers, useDeleteCustomer } from "@/hooks/use-customers";
import { CustomerModal } from "@/components/dashboard/customer-modal";
import { DeleteDialog } from "@/components/dashboard/delete-dialog";
import { Can } from "@/components/rbac/permission-guard";
import { useHasPermission } from "@/hooks/use-rbac";
import type { Customer } from "@/lib/types";
import { useTranslation } from "react-i18next";
import {
  DashboardCard,
  DashboardStatCard,
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";

export default function CustomersPage() {
  const { t } = useTranslation("common");
  const { data: customers = [], isLoading, error } = useCustomers();
  const deleteCustomer = useDeleteCustomer();
  const canCreateCustomers = useHasPermission("customers.create");
  const canEditCustomers = useHasPermission("customers.edit");
  const canDeleteCustomers = useHasPermission("customers.delete");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; customer?: Customer | null }>({ open: false });
  const [del, setDel] = useState<Customer | null>(null);

  const filtered = customers.filter((customer: Customer) =>
    customer.name.toLowerCase().includes(search.toLowerCase()) ||
    (customer.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const pending = deleteCustomer.isPending;
  const newCount   = customers.filter((customer: Customer) => {
    const d = new Date(customer.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("dashboard.customers.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dashboard.customers.subtitle")}</p>
        </div>
        <Can permission="customers.create">
          <Button onClick={() => setModal({ open: true, customer: null })} className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary gap-2">
            <Plus className="w-4 h-4" /> {t("buttons.addCustomer")}
          </Button>
        </Can>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardStatCard label={t("dashboard.customers.stats.total")} value={customers.length}    icon={Users}         loading={isLoading} />
        <DashboardStatCard label={t("dashboard.customers.stats.newMonth")}  value={newCount}            icon={TrendingUp}    loading={isLoading} />
        <DashboardStatCard label={t("dashboard.customers.stats.withEmail")}      value={customers.filter((customer: Customer) => customer.email).length}    icon={Mail}    loading={isLoading} />
        <DashboardStatCard label={t("dashboard.customers.stats.withPhone")}      value={customers.filter((customer: Customer) => customer.phone).length}    icon={Phone}   loading={isLoading} />
      </div>

      {error && <DashboardErrorBanner message={error.message} />}

      <DashboardCard className="overflow-hidden">
        <div className="p-5 flex items-center gap-3 border-b border-white/5">
          <div className="flex-1 flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-4 py-2.5">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("dashboard.customers.searchPlaceholder")}
              className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground"
            />
          </div>
          <Button variant="outline" size="sm" className="border-white/10 gap-2 shrink-0">
            <Filter className="w-3.5 h-3.5" /> {t("buttons.filter")}
          </Button>
        </div>
        {isLoading ? <DashboardTableSkeleton /> : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            {customers.length === 0 ? t("dashboard.customers.emptyAll") : t("dashboard.customers.emptySearch")}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((customer: Customer) => (
              <div key={customer.id} className="flex items-center px-6 py-4 hover:bg-white/[0.02] transition-colors gap-4">
                <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                  {customer.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{customer.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{customer.email ?? customer.phone ?? "—"}</p>
                </div>
                <p className="text-xs text-muted-foreground font-mono hidden md:block">
                  <span dir="ltr">{format(new Date(customer.created_at), "MMM dd, yyyy")}</span>
                </p>
                <div className="flex items-center gap-1">
                  {canEditCustomers && (
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setModal({ open: true, customer })}>
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  )}
                  {canDeleteCustomers && (
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setDel(customer)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      <CustomerModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        customer={modal.customer}
      />
      <DeleteDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => {
          if (!del || !canDeleteCustomers) return;
          deleteCustomer.mutate(del.id, { onSuccess: () => setDel(null) });
        }}
        isPending={pending}
        itemName={del?.name}
      />
    </div>
  );
}
