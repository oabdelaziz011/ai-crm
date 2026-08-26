import { useState } from "react";
import {
  Phone,
  MessageCircle,
  Pencil,
  CalendarClock,
  XCircle,
  UserCheck,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CustomerTimelinePanel } from "@/lib/customer-timeline/components/customer-timeline";
import type { OperationsBookingView } from "@/lib/scheduling/operations/types";
import {
  canCancelOperationsBooking,
  canCheckInBooking,
  canCompleteOperationsBooking,
  canEditOperationsBooking,
  canRescheduleOperationsBooking,
  canPerformOperationsAction,
} from "@/lib/scheduling/operations";
import { useAuthUser } from "@/hooks/use-rbac";
import { statusBadgeClasses } from "@/lib/scheduling/operations/utilities";
import { formatOperationsCurrency } from "@/lib/scheduling/operations/utilities";

type OperationsBookingDrawerProps = {
  booking: OperationsBookingView | null;
  open: boolean;
  onClose: () => void;
  onCall: () => void;
  onWhatsapp: () => void;
  onEdit: () => void;
  onReschedule: () => void;
  onCancel: () => void;
  onCheckIn: () => void;
  onComplete: () => void;
  onInvoice: () => void;
  actionPending?: boolean;
};

export function OperationsBookingDrawer({
  booking,
  open,
  onClose,
  onCall,
  onWhatsapp,
  onEdit,
  onReschedule,
  onCancel,
  onCheckIn,
  onComplete,
  onInvoice,
  actionPending,
}: OperationsBookingDrawerProps) {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const [historyTab, setHistoryTab] = useState<"booking" | "audit">("booking");

  if (!booking) return null;

  const permCtx = { hasPermission, isSuperAdmin };

  const actions = [
    {
      key: "call",
      label: t("scheduling.operations.actions.call"),
      icon: Phone,
      onClick: onCall,
      visible: canPerformOperationsAction("call", permCtx) && Boolean(booking.customer?.phone),
    },
    {
      key: "whatsapp",
      label: t("scheduling.operations.actions.whatsapp"),
      icon: MessageCircle,
      onClick: onWhatsapp,
      visible: canPerformOperationsAction("whatsapp", permCtx),
    },
    {
      key: "edit",
      label: t("scheduling.operations.actions.edit"),
      icon: Pencil,
      onClick: onEdit,
      visible: canEditOperationsBooking(booking.status, permCtx),
    },
    {
      key: "reschedule",
      label: t("scheduling.operations.actions.reschedule"),
      icon: CalendarClock,
      onClick: onReschedule,
      visible: canRescheduleOperationsBooking(booking.status, permCtx),
    },
    {
      key: "cancel",
      label: t("scheduling.operations.actions.cancel"),
      icon: XCircle,
      onClick: onCancel,
      visible: canCancelOperationsBooking(booking.status, permCtx),
    },
    {
      key: "checkIn",
      label: t("scheduling.operations.actions.checkIn"),
      icon: UserCheck,
      onClick: onCheckIn,
      visible: canCheckInBooking(booking.status, permCtx),
    },
    {
      key: "complete",
      label: t("scheduling.operations.actions.complete"),
      icon: CheckCircle2,
      onClick: onComplete,
      visible: canCompleteOperationsBooking(booking.status, permCtx),
    },
    {
      key: "invoice",
      label: t("scheduling.operations.actions.invoice"),
      icon: FileText,
      onClick: onInvoice,
      visible: canPerformOperationsAction("invoice", permCtx),
    },
  ].filter((action) => action.visible);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <p dir="ltr" className="font-mono text-[12px] text-muted-foreground">
            {booking.confirmationNumber?.trim() || "—"}
          </p>
          <SheetTitle>{booking.customer?.name ?? t("scheduling.operations.drawer.title")}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs ${statusBadgeClasses(booking.status)}`}>
              {t(`scheduling.operations.status.${booking.status}`)}
            </span>
            <span className="rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground">
              {t(`scheduling.operations.payment.${booking.paymentStatus}`)}
            </span>
          </div>

          <dl className="space-y-3 text-sm">
            <DetailRow
              label={t("scheduling.operations.drawer.referenceNumber")}
              value={
                booking.confirmationNumber?.trim() || "—"
              }
              mono
            />
            <DetailRow label={t("scheduling.operations.drawer.phone")} value={booking.customer?.phone} />
            <DetailRow label={t("scheduling.operations.drawer.email")} value={booking.customer?.email} />
            <DetailRow label={t("scheduling.operations.drawer.service")} value={booking.service?.name} />
            <DetailRow label={t("scheduling.operations.drawer.resource")} value={booking.resource?.name} />
            <DetailRow
              label={t("scheduling.operations.drawer.time")}
              value={`${booking.displayStart} – ${booking.displayEnd}`}
            />
            <DetailRow
              label={t("scheduling.operations.drawer.duration")}
              value={`${booking.durationMinutes} ${t("scheduling.operations.minutes")}`}
            />
            <DetailRow
              label={t("scheduling.operations.drawer.price")}
              value={formatOperationsCurrency(booking.service?.priceCents ?? 0)}
            />
            <DetailRow label={t("scheduling.operations.drawer.notes")} value={booking.notes} />
            <DetailRow label={t("scheduling.operations.drawer.createdBy")} value={booking.createdBy} />
            <DetailRow label={t("scheduling.operations.drawer.bookingId")} value={booking.id} mono />
          </dl>

          <div className="grid grid-cols-2 gap-2">
            {actions.map((action) => (
              <Button
                key={action.key}
                variant="outline"
                size="sm"
                className="justify-start gap-2"
                disabled={actionPending}
                onClick={action.onClick}
              >
                <action.icon className="h-4 w-4" />
                {action.label}
              </Button>
            ))}
          </div>

          <div>
            <div className="mb-3 flex gap-2">
              <Button
                size="sm"
                variant={historyTab === "booking" ? "default" : "outline"}
                onClick={() => setHistoryTab("booking")}
              >
                {t("scheduling.operations.drawer.bookingHistory")}
              </Button>
              <Button
                size="sm"
                variant={historyTab === "audit" ? "default" : "outline"}
                onClick={() => setHistoryTab("audit")}
              >
                {t("scheduling.operations.drawer.auditHistory")}
              </Button>
            </div>
            {historyTab === "booking" && booking.customerId ? (
              <CustomerTimelinePanel
                customerId={booking.customerId}
                companyId={booking.companyId}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("scheduling.operations.drawer.auditHint")}
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 break-all ${mono ? "font-mono text-[12px]" : ""}`} dir={mono ? "ltr" : undefined}>
        {value?.trim() ? value : "—"}
      </dd>
    </div>
  );
}
