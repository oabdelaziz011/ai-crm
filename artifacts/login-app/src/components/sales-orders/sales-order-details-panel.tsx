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
import { useState } from "react";
import { useAuthUser, usePermissions } from "@/hooks/use-rbac";
import { useDeliveryWorkersForZone } from "@/hooks/sales/use-company-delivery-workers";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

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

const KNOWN_STATUS_NOTES: Record<string, string> = {
  "Created by AI after explicit customer confirmation":
    "salesOrders.details.notes.createdByAi",
  "Approved by human reviewer": "salesOrders.details.notes.approvedByHuman",
  "Rejected by human reviewer": "salesOrders.details.notes.rejectedByHuman",
};

function translateStatusNote(
  note: string,
  changedByName: string | null,
  t: (key: string, options?: Record<string, string>) => string,
): string {
  const key = KNOWN_STATUS_NOTES[note];
  if (!key) return note;
  if (
    changedByName &&
    (key === "salesOrders.details.notes.approvedByHuman" ||
      key === "salesOrders.details.notes.rejectedByHuman")
  ) {
    return t(key, { name: changedByName });
  }
  if (key === "salesOrders.details.notes.approvedByHuman") {
    return t("salesOrders.details.notes.approvedByHumanFallback");
  }
  if (key === "salesOrders.details.notes.rejectedByHuman") {
    return t("salesOrders.details.notes.rejectedByHumanFallback");
  }
  return t(key);
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
  const { toast } = useToast();
  const detail = useSalesOrderDetail(companyId, orderId);
  const { approve, reject, assignDelivery, retryDeliveryNotify } =
    useSalesOrderApprovalActions(companyId);
  const { user } = useAuthUser();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("orders.edit");
  const canAssign = hasPermission("orders.assign_delivery");
  const order = detail.data;
  const { workers } = useDeliveryWorkersForZone(companyId, order?.deliveryZoneId ?? null);
  const [workerId, setWorkerId] = useState("");
  const [reassignWorkerId, setReassignWorkerId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [reassignConfirm, setReassignConfirm] = useState(false);
  const busy =
    approve.isPending ||
    reject.isPending ||
    assignDelivery.isPending ||
    retryDeliveryNotify.isPending;

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
                    approve.mutate(
                      { orderId: order.id, userId: user.id },
                      {
                        onSuccess: (result) => {
                          if (result.pendingReason) {
                            toast({
                              title: t("salesOrders.details.assignmentPendingTitle"),
                              description: result.pendingReason,
                            });
                          } else if (result.autoAssigned && result.assignResult) {
                            toast({
                              title: t("salesOrders.details.assignDeliverySuccess", {
                                name: result.assignResult.workerName,
                              }),
                              description: result.notifyOk
                                ? t("salesOrders.details.assignDeliveryNotifyOk")
                                : t("salesOrders.details.assignDeliveryNotifyFailed", {
                                    error: result.notifyError ?? "",
                                  }),
                            });
                          }
                        },
                      },
                    )
                  }
                >
                  {approve.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    t("salesOrders.details.approve")
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
                    t("salesOrders.details.reject")
                  )}
                </Button>
              </div>
            ) : null}
            {approve.error || reject.error || assignDelivery.error || retryDeliveryNotify.error ? (
              <DashboardErrorBanner
                message={
                  (
                    approve.error ??
                    reject.error ??
                    assignDelivery.error ??
                    retryDeliveryNotify.error
                  )?.message ?? t("salesOrders.details.actionFailed")
                }
              />
            ) : null}

            {order.assignmentPendingReason ? (
              <div
                className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
                data-testid="sales-order-assignment-pending"
              >
                <p className="font-medium">{t("salesOrders.details.assignmentPendingTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {order.assignmentPendingReason}
                </p>
              </div>
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
                {order.customerSecondaryPhone ? (
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {t("salesOrders.details.secondaryPhone", {
                      phone: order.customerSecondaryPhone,
                    })}
                  </p>
                ) : null}
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
                    {t("salesOrders.details.openCustomer")}
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
                    status: t(`salesOrders.paymentStatus.${order.paymentStatus}`, {
                      defaultValue: order.paymentStatus,
                    }),
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
                  {t("salesOrders.details.attribution")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("salesOrders.details.aiEmployee", {
                    id: order.aiEmployeeId || "—",
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("salesOrders.details.salesperson", {
                    id: order.assignedSalespersonId || "—",
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("salesOrders.details.sourceChannel", {
                    channel: order.sourceChannel
                      ? t(`salesOrders.sourceChannel.${order.sourceChannel}`, {
                          defaultValue: order.sourceChannel,
                        })
                      : "—",
                  })}
                </p>
                {order.preferredLanguage ? (
                  <p className="text-xs text-muted-foreground">
                    {t("salesOrders.details.preferredLanguage", {
                      lang: order.preferredLanguage,
                    })}
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl border border-border/60 p-3 sm:col-span-1">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("salesOrders.details.delivery")}
                </h3>
                <p>
                  {[order.deliveryGovernorate, order.deliveryCityArea].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="mt-1 text-muted-foreground">{order.deliveryAddress || "—"}</p>
                {order.etaMinSnapshot != null &&
                order.etaMaxSnapshot != null &&
                order.etaUnitSnapshot ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("salesOrders.details.etaSnapshot", {
                      min: String(order.etaMinSnapshot),
                      max: String(order.etaMaxSnapshot),
                      unit: order.etaUnitSnapshot,
                    })}
                  </p>
                ) : null}
                {order.assignedDeliveryWorkerName ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("salesOrders.details.assignedWorker", {
                      name: order.assignedDeliveryWorkerName,
                    })}
                    {order.assignedDeliveryWorkerPhone ? (
                      <span dir="ltr"> · {order.assignedDeliveryWorkerPhone}</span>
                    ) : null}
                  </p>
                ) : null}
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
                    {t("salesOrders.details.locationUrl")}
                  </a>
                ) : null}
                {order.deliveryLat != null && order.deliveryLng != null ? (
                  <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                    {order.deliveryLat}, {order.deliveryLng}
                  </p>
                ) : null}
              </div>
            </section>

            {(order.status === "confirmed" || order.status === "processing") &&
            canAssign &&
            user?.id &&
            !order.assignedDeliveryWorkerId ? (
              <div
                className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3"
                data-testid="sales-order-assign-delivery"
              >
                <Label>{t("salesOrders.details.assignDeliverySelect")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("salesOrders.details.assignDeliveryHelp")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("salesOrders.details.assignDeliveryNearDetails")}
                </p>
                {workers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("salesOrders.details.assignDeliveryEmpty")}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <select
                      className="flex h-10 min-w-[14rem] flex-1 rounded-md border border-input bg-background px-3 text-sm"
                      value={workerId}
                      onChange={(event) => setWorkerId(event.target.value)}
                    >
                      <option value="">—</option>
                      {workers.map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {worker.fullName} ({worker.phoneE164})
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || !workerId}
                      onClick={() => {
                        if (!user.id || !workerId) return;
                        assignDelivery.mutate(
                          { orderId: order.id, userId: user.id, workerId },
                          {
                            onSuccess: (result) => {
                              toast({
                                title: t("salesOrders.details.assignDeliverySuccess", {
                                  name: result.workerName,
                                }),
                                description: result.notifyOk
                                  ? t("salesOrders.details.assignDeliveryNotifyOk")
                                  : t("salesOrders.details.assignDeliveryNotifyFailed", {
                                      error: result.notifyError ?? "",
                                    }),
                              });
                              setWorkerId("");
                            },
                          },
                        );
                      }}
                    >
                      {assignDelivery.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        t("salesOrders.details.assignDelivery")
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ) : null}

            {order.assignedDeliveryWorkerId && canAssign && user?.id ? (
              <div
                className="space-y-3 rounded-xl border border-border/60 p-3"
                data-testid="sales-order-reassign-delivery"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {t("salesOrders.details.assignedWorker", {
                        name: order.assignedDeliveryWorkerName || "—",
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("salesOrders.details.notifyStatus", {
                        status: t(`salesOrders.details.notifyStatusValue.${order.deliveryNotifyStatus}`),
                      })}
                      {order.deliveryAssignmentModeApplied
                        ? ` · ${t(`salesOrders.details.assignmentModeValue.${order.deliveryAssignmentModeApplied}`)}`
                        : null}
                    </p>
                    {order.deliveryNotifyError ? (
                      <p className="text-xs text-destructive">{order.deliveryNotifyError}</p>
                    ) : null}
                  </div>
                  {order.deliveryNotifyStatus === "failed" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        retryDeliveryNotify.mutate(
                          { orderId: order.id, userId: user.id },
                          {
                            onSuccess: (result) => {
                              toast({
                                title: result.skipped
                                  ? t("salesOrders.details.retryNotifySkipped")
                                  : result.notifyOk
                                    ? t("salesOrders.details.retryNotifyOk")
                                    : t("salesOrders.details.retryNotifyFailed"),
                                description: result.skipped
                                  ? result.reason ?? undefined
                                  : result.notifyError ?? undefined,
                              });
                            },
                          },
                        )
                      }
                    >
                      {retryDeliveryNotify.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        t("salesOrders.details.retryNotify")
                      )}
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-2 border-t border-border/40 pt-3">
                  <Label>{t("salesOrders.details.reassignTitle")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("salesOrders.details.reassignHelp")}
                  </p>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={reassignWorkerId}
                    onChange={(event) => setReassignWorkerId(event.target.value)}
                  >
                    <option value="">—</option>
                    {workers
                      .filter((worker) => worker.id !== order.assignedDeliveryWorkerId)
                      .map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {worker.fullName} ({worker.phoneE164})
                        </option>
                      ))}
                  </select>
                  <Input
                    value={reassignReason}
                    placeholder={t("salesOrders.details.reassignReasonPlaceholder")}
                    onChange={(event) => setReassignReason(event.target.value)}
                  />
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={reassignConfirm}
                      onChange={(event) => setReassignConfirm(event.target.checked)}
                    />
                    {t("salesOrders.details.reassignConfirm")}
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      busy ||
                      !reassignWorkerId ||
                      !reassignReason.trim() ||
                      !reassignConfirm
                    }
                    onClick={() => {
                      if (!user.id || !reassignWorkerId) return;
                      assignDelivery.mutate(
                        {
                          orderId: order.id,
                          userId: user.id,
                          workerId: reassignWorkerId,
                          reassign: true,
                          reassignmentReason: reassignReason.trim(),
                        },
                        {
                          onSuccess: (result) => {
                            toast({
                              title: t("salesOrders.details.reassignSuccess", {
                                name: result.workerName,
                              }),
                              description: result.notifyOk
                                ? t("salesOrders.details.assignDeliveryNotifyOk")
                                : t("salesOrders.details.assignDeliveryNotifyFailed", {
                                    error: result.notifyError ?? "",
                                  }),
                            });
                            setReassignWorkerId("");
                            setReassignReason("");
                            setReassignConfirm(false);
                          },
                        },
                      );
                    }}
                  >
                    {assignDelivery.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      t("salesOrders.details.reassign")
                    )}
                  </Button>
                </div>
              </div>
            ) : null}

            {order.deliveryAssignments.length > 0 ? (
              <section
                className="rounded-xl border border-border/60 p-3"
                data-testid="sales-order-assignment-history"
              >
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("salesOrders.details.assignmentHistory")}
                </h3>
                <ul className="space-y-2">
                  {order.deliveryAssignments.map((entry) => (
                    <li key={entry.id} className="text-xs">
                      <span className="font-medium">
                        {t(`salesOrders.details.assignmentOutcome.${entry.outcome}`)}
                      </span>
                      <span className="text-muted-foreground">
                        {" · "}
                        {t(`salesOrders.details.assignmentModeValue.${entry.assignmentMode}`)}
                      </span>
                      {entry.newWorkerName ? (
                        <span className="text-muted-foreground">
                          {" → "}
                          {entry.newWorkerName}
                        </span>
                      ) : null}
                      {entry.previousWorkerName ? (
                        <span className="text-muted-foreground">
                          {" ("}
                          {t("salesOrders.details.previousWorker", {
                            name: entry.previousWorkerName,
                          })}
                          {")"}
                        </span>
                      ) : null}
                      <span className="ms-2 text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString(i18n.language)}
                      </span>
                      {entry.assignedByName ? (
                        <p className="mt-0.5 text-muted-foreground">
                          {t("salesOrders.details.assignedBy", { name: entry.assignedByName })}
                        </p>
                      ) : null}
                      {entry.reassignmentReason ? (
                        <p className="mt-0.5 text-muted-foreground">{entry.reassignmentReason}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

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
                      {event.note ? (
                        <p className="mt-0.5 text-muted-foreground">
                          {translateStatusNote(event.note, event.changedByName, t)}
                        </p>
                      ) : null}
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
