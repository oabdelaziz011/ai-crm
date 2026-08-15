import { CalendarDays, Plus } from "lucide-react";
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
  bookingReferenceNumber,
  filterBookingsForCustomer,
  fmtDateTime,
  localizeBookingStatus,
} from "@/lib/customer-workspace/customer-workspace-utils";
import type { Booking, Customer } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  customer: Customer;
  bookings: Booking[];
  loading?: boolean;
  onNewBooking: () => void;
};

function bookingSortKey(booking: Booking): number {
  return new Date(booking.booking_date).getTime();
}

function groupLabel(booking: Booking): "current" | "upcoming" | "past" | "cancelled" {
  const status = (booking.scheduling_status ?? booking.status ?? "").toLowerCase();
  if (status.includes("cancel")) return "cancelled";
  const now = Date.now();
  const at = bookingSortKey(booking);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (at >= startOfToday.getTime() && at <= endOfToday.getTime()) return "current";
  if (at > now) return "upcoming";
  return "past";
}

export function WorkspaceBookingsTab({ customer, bookings, loading, onNewBooking }: Props) {
  const { t, i18n } = useTranslation("common");
  const rows = useMemo(() => {
    return filterBookingsForCustomer(bookings, customer.id).sort(
      (a, b) => bookingSortKey(b) - bookingSortKey(a),
    );
  }, [bookings, customer.id]);

  if (loading) return <WorkspaceSkeleton rows={6} />;

  return (
    <WorkspaceTabFrame
      title={t("dashboard.customerWorkspace.tabs.bookings")}
      subtitle={t("dashboard.customers.list.rowCount", { count: rows.length })}
      action={
        <Button size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={onNewBooking}>
          <Plus className="size-3.5" />
          {t("buttons.newBooking")}
        </Button>
      }
    >
      {rows.length === 0 ? (
        <WorkspaceInlineEmpty
          icon={CalendarDays}
          title={t("dashboard.customerWorkspace.bookings.emptyTitle")}
          description={t("dashboard.customerWorkspace.bookings.emptyDescription")}
          actionLabel={t("buttons.newBooking")}
          onAction={onNewBooking}
        />
      ) : (
        <table className="w-full min-w-[42rem] table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-[20%] px-3 py-2.5 text-start">
                {t("dashboard.customerWorkspace.bookings.colReference")}
              </th>
              <th className="w-[24%] px-3 py-2.5 text-start">
                {t("dashboard.customerWorkspace.bookings.colService")}
              </th>
              <th className="w-[28%] px-3 py-2.5 text-start">
                {t("dashboard.customerWorkspace.bookings.colWhen")}
              </th>
              <th className="w-[14%] px-3 py-2.5 text-start">
                {t("dashboard.customerWorkspace.bookings.period")}
              </th>
              <th className="w-[14%] px-3 py-2.5 text-start">
                {t("dashboard.customerWorkspace.bookings.colStatus")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((booking) => {
              const bucket = groupLabel(booking);
              return (
                <tr key={booking.id} className="border-b border-border/40 hover:bg-primary/5">
                  <td className="px-3 py-2.5 text-start text-muted-foreground">
                    <span dir="ltr" className="inline-block font-mono text-xs tabular-nums">
                      {bookingReferenceNumber(booking)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-start font-medium">{booking.service || "—"}</td>
                  <td className="px-3 py-2.5 text-start tabular-nums text-muted-foreground">
                    {fmtDateTime(booking.booking_date, i18n.language)}
                  </td>
                  <td className="px-3 py-2.5 text-start">
                    <span
                      className={cn(
                        "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                        bucket === "current" && "bg-primary/15 text-primary",
                        bucket === "upcoming" && "bg-blue-500/15 text-blue-700 dark:text-blue-300",
                        bucket === "past" && "bg-muted text-muted-foreground",
                        bucket === "cancelled" && "bg-destructive/10 text-destructive",
                      )}
                    >
                      {t(`dashboard.customerWorkspace.bookings.${bucket}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-start">
                    <WorkspaceStatusChip>
                      {localizeBookingStatus(booking.scheduling_status ?? booking.status, (key) => t(key))}
                    </WorkspaceStatusChip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </WorkspaceTabFrame>
  );
}
