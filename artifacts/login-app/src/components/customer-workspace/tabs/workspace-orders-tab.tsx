import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { WorkspaceTabFrame } from "@/components/customer-workspace/workspace-tab-frame";
import { useCustomerSalesOrderHistory } from "@/hooks/sales/use-sales-orders";
import { formatSalesMoney } from "@/lib/sales/sales-localize";
import { DashboardErrorBanner } from "@/components/dashboard/ui";

type Props = {
  companyId: string | null;
  customerId: string;
};

export function WorkspaceOrdersTab({ companyId, customerId }: Props) {
  const { t, i18n } = useTranslation("common");
  const history = useCustomerSalesOrderHistory(companyId, customerId);

  return (
    <WorkspaceTabFrame
      title={t("dashboard.customerWorkspace.tabs.orders", { defaultValue: "Orders" })}
      subtitle={t("dashboard.customerWorkspace.orders.subtitle", {
        defaultValue: "Sales orders linked to this CRM customer (not bookings).",
      })}
    >
      {history.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : history.error ? (
        <DashboardErrorBanner message={history.error.message} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border/60 p-3">
              <p className="text-xs text-muted-foreground">
                {t("dashboard.customerWorkspace.orders.totalOrders", { defaultValue: "Total orders" })}
              </p>
              <p className="mt-1 text-lg font-semibold">{history.data?.totalOrders ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border/60 p-3">
              <p className="text-xs text-muted-foreground">
                {t("dashboard.customerWorkspace.orders.totalValue", { defaultValue: "Total value" })}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {formatSalesMoney(
                  history.data?.totalValue ?? 0,
                  history.data?.currency ?? "EGP",
                  i18n.language,
                )}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 p-3">
              <p className="text-xs text-muted-foreground">
                {t("dashboard.customerWorkspace.orders.firstOrder", { defaultValue: "First order" })}
              </p>
              <p className="mt-1 text-sm">
                {history.data?.firstOrderAt
                  ? new Date(history.data.firstOrderAt).toLocaleString(i18n.language)
                  : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 p-3">
              <p className="text-xs text-muted-foreground">
                {t("dashboard.customerWorkspace.orders.lastOrder", { defaultValue: "Last order" })}
              </p>
              <p className="mt-1 text-sm">
                {history.data?.lastOrderAt
                  ? new Date(history.data.lastOrderAt).toLocaleString(i18n.language)
                  : "—"}
              </p>
            </div>
          </div>

          {(history.data?.orders.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("dashboard.customerWorkspace.orders.empty", {
                defaultValue: "No sales orders for this customer yet.",
              })}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full min-w-[40rem] table-fixed border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-start">
                      {t("salesOrders.columns.orderNumber")}
                    </th>
                    <th className="px-3 py-2 text-start">{t("salesOrders.columns.items")}</th>
                    <th className="px-3 py-2 text-start">{t("salesOrders.columns.total")}</th>
                    <th className="px-3 py-2 text-start">{t("salesOrders.columns.status")}</th>
                    <th className="px-3 py-2 text-start">
                      {t("dashboard.customerWorkspace.orders.created", { defaultValue: "Created" })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.data?.orders.map((order) => (
                    <tr key={order.id} className="border-b border-border/40">
                      <td className="px-3 py-2">
                        <Link
                          href="~/dashboard/sales-orders"
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {order.itemsSummary || "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatSalesMoney(order.totalAmount, order.currency, i18n.language)}
                      </td>
                      <td className="px-3 py-2">{t(`salesOrders.status.${order.status}`)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(order.createdAt).toLocaleString(i18n.language)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </WorkspaceTabFrame>
  );
}
