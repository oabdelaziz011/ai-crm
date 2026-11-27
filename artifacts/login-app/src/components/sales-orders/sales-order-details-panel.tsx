import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useSalesOrderApprovalActions,
  useSalesOrderDetail,
} from "@/hooks/sales/use-sales-orders";
import { formatSalesMoney } from "@/lib/sales/sales-localize";
import type { SalesOrderStatus } from "@/lib/sales-orders/sales-order-types";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import { useAuthUser, usePermissions } from "@/hooks/use-rbac";

function statusClass(status: SalesOrderStatus): string {
  switch (status) {
    case "delivered":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "cancelled":
      return "bg-destructive/10 text-destructive";
    case "pending_approval":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "out_for_delivery":
    case "processing":
    case "confirmed":
      return "bg-sky-500/15 text-sky-800 dark:text-sky-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function SalesOrderDetailsPanel({
  companyId,
  orderId,
  open,
  onOpenChange,
}: {
  companyId: string | null;
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation("common");
  const detail = useSalesOrderDetail(companyId, orderId);
  const { approve, reject } = useSalesOrderApprovalActions(companyId);
  const { user } = useAuthUser();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("orders.edit");
  const order = detail.data;
  const busy = approve.isPending || reject.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" dir={i18n.dir()}>
        <DialogHeader>
          <DialogTitle>
            {order
              ? t("salesOrders.details.title", { number: order.orderNumber })
              : t("salesOrders.details.loadingTitle")}
          </DialogTitle>
        </DialogHeader>

        {detail.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : detail.error ? (
          <DashboardErrorBanner message={detail.error.message} />
        ) : !order ? (
          <p className="text-sm text-muted-foreground">{t("salesOrders.details.notFound")}</p>
        ) : (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", statusClass(order.status))}>
                {t(`salesOrders.status.${order.status}`)}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("salesOrders.details.createdAt", {
                  date: new Date(order.createdAt).toLocaleString(i18n.language),
                })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("salesOrders.details.updatedAt", {
                  defaultValue: "Updated {{date}}",
                  date: new Date(order.updatedAt).toLocaleString(i18n.language),
                })}
              </span>
            </div>

            {order.status === "pending_approval" && canEdit && user?.id ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    approve.mutate({ orderId: order.id, userId: user.id })
                  }
                >
                  {approve.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    t("salesOrders.details.approve", { defaultValue: "Approve" })
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    reject.mutate({ orderId: order.id, userId: user.id })
                  }
                >
                  {reject.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    t("salesOrders.details.reject", { defaultValue: "Reject" })
                  )}
                </Button>
              </div>
            ) : null}
            {approve.error || reject.error ? (
              <DashboardErrorBanner
                message={(approve.error ?? reject.error)?.message ?? "Action failed"}
              />
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("salesOrders.details.customer")}
                </h3>
                <p className="font-medium">{order.customerName || "—"}</p>
                <p className="text-muted-foreground" dir="ltr">
                  {order.customerPhone || "—"}
                </p>
                {order.customerEmail ? (
                  <p className="text-muted-foreground" dir="ltr">
                    {order.customerEmail}
                  </p>
                ) : null}
                {order.customerId ? (
                  <Link
                    href={`~/dashboard/customers/${order.customerId}/orders`}
                    className="mt-2 inline-block text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {t("salesOrders.details.openCustomer", {
                      defaultValue: "Open CRM customer",
                    })}
                  </Link>
                ) : null}
              </div>
              <div className="rounded-xl border border-border/60 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("salesOrders.details.payment")}
                </h3>
                <p>{t(`salesOrders.payment.${order.paymentMethod}`)}</p>
                <p className="text-xs text-muted-foreground">
                  {t("salesOrders.details.paymentStatus", {
                    defaultValue: "Payment status: {{status}}",
                    status: order.paymentStatus,
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {order.requireHumanApproval
                    ? t("salesOrders.details.humanApprovalRequired")
                    : t("salesOrders.details.humanApprovalOff")}
                </p>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("salesOrders.details.attribution", { defaultValue: "Attribution" })}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("salesOrders.details.aiEmployee", {
                    defaultValue: "AI employee: {{id}}",
                    id: order.aiEmployeeId || "—",
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("salesOrders.details.salesperson", {
                    defaultValue: "Salesperson: {{id}}",
                    id: order.assignedSalespersonId || "—",
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("salesOrders.details.sourceChannel", {
                    defaultValue: "Source: {{channel}}",
                    channel: order.sourceChannel || "—",
                  })}
                </p>
                {order.preferredLanguage ? (
                  <p className="text-xs text-muted-foreground">
                    {t("salesOrders.details.preferredLanguage", {
                      defaultValue: "Language: {{lang}}",
                      lang: order.preferredLanguage,
                    })}
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl border border-border/60 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("salesOrders.details.delivery")}
                </h3>
                <p>
                  {[order.deliveryGovernorate, order.deliveryCityArea].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="mt-1 text-muted-foreground">{order.deliveryAddress || "—"}</p>
                {order.deliveryNotes ? (
                  <p className="mt-2 text-xs text-muted-foreground">{order.deliveryNotes}</p>
                ) : null}
                {order.deliveryLocationUrl ? (
                  <a
                    href={order.deliveryLocationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {t("salesOrders.details.locationUrl", { defaultValue: "Open location" })}
                  </a>
                ) : null}
                {order.deliveryLat != null && order.deliveryLng != null ? (
                  <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                    {order.deliveryLat}, {order.deliveryLng}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="rounded-xl border border-border/60 p-3">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("salesOrders.details.items")}
              </h3>
              {order.items.length === 0 ? (
                <p className="text-muted-foreground">{t("salesOrders.details.noItems")}</p>
              ) : (
                <div className="space-y-2">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.productSku
                            ? t("salesOrders.details.skuQty", {
                                sku: item.productSku,
                                qty: item.quantity,
                              })
                            : t("salesOrders.details.qtyOnly", { qty: item.quantity })}
                        </p>
                      </div>
                      <p className="tabular-nums">
                        {formatSalesMoney(item.lineTotal, order.currency, i18n.language)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 space-y-1 border-t border-border/50 pt-3 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("salesOrders.details.subtotal")}</span>
                  <span className="tabular-nums">
                    {formatSalesMoney(order.subtotal, order.currency, i18n.language)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("salesOrders.details.deliveryFee")}</span>
                  <span className="tabular-nums">
                    {formatSalesMoney(order.deliveryFee, order.currency, i18n.language)}
                  </span>
                </div>
                <div className="flex justify-between gap-3 text-sm font-semibold">
                  <span>{t("salesOrders.details.total")}</span>
                  <span className="tabular-nums">
                    {formatSalesMoney(order.totalAmount, order.currency, i18n.language)}
                  </span>
                </div>
              </div>
            </section>

            {order.conversationId ? (
              <p className="text-xs">
                <Link
                  href={`~/dashboard/omnichannel?conversation=${order.conversationId}`}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {t("salesOrders.details.openConversation")}
                </Link>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t("salesOrders.details.noConversation")}</p>
            )}

            <section className="rounded-xl border border-border/60 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("salesOrders.details.statusHistory")}
              </h3>
              {order.statusHistory.length === 0 ? (
                <p className="text-muted-foreground">{t("salesOrders.details.noHistory")}</p>
              ) : (
                <ul className="space-y-2">
                  {order.statusHistory.map((event) => (
                    <li key={event.id} className="text-xs">
                      <span className="font-medium">{t(`salesOrders.status.${event.toStatus}`)}</span>
                      {event.fromStatus ? (
                        <span className="text-muted-foreground">
                          {" "}
                          ← {t(`salesOrders.status.${event.fromStatus}`)}
                        </span>
                      ) : null}
                      <span className="ms-2 text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString(i18n.language)}
                      </span>
                      {event.note ? <p className="mt-0.5 text-muted-foreground">{event.note}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
