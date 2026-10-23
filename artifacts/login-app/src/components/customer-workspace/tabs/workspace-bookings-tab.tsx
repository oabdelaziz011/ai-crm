import { CalendarDays, Plus } from "lucide-react";
import { useMemo, useState } from "react";
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
import { pricingTypeLabel } from "@/lib/scheduling/pricing-type-label";
import type { Booking, Customer } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  customer: Customer;
  bookings: Booking[];
  loading?: boolean;
  onNewBooking: () => void;
  canNewBooking?: boolean;
};

type KindFilter = "all" | "operational" | "sales_demo";

function bookingSortKey(booking: Booking): number {
  return new Date(booking.booking_date).getTime();
}

function bookingChannelLabel(
  source: string | null | undefined,
  translate: (key: string) => string,
): string {
  if (!source?.trim()) return "—";
  const key = `dashboard.customerWorkspace.bookings.channels.${source.trim()}`;
  const label = translate(key);
  return label === key ? source : label;
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

function bookingServiceKind(booking: Booking): "operational" | "sales_demo" {
  return booking.service_kind === "sales_demo" ? "sales_demo" : "operational";
}

export function WorkspaceBookingsTab({ customer, bookings, loading, onNewBooking, canNewBooking = false }: Props) {
  const { t, i18n } = useTranslation("common");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const rows = useMemo(() => {
    return filterBookingsForCustomer(bookings, customer.id)
      .filter((booking) => kindFilter === "all" || bookingServiceKind(booking) === kindFilter)
      .sort((a, b) => bookingSortKey(b) - bookingSortKey(a));
  }, [bookings, customer.id, kindFilter]);

  const demoCount = useMemo(
    () =>
      filterBookingsForCustomer(bookings, customer.id).filter(
        (booking) => bookingServiceKind(booking) === "sales_demo",
      ).length,
    [bookings, customer.id],
  );

  if (loading) return <WorkspaceSkeleton rows={6} />;

  return (
    <WorkspaceTabFrame
      title={t("dashboard.customerWorkspace.tabs.bookings")}
      subtitle={t("dashboard.customers.list.rowCount", { count: rows.length })}
      action={
        canNewBooking ? (
        <Button size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={onNewBooking}>
          <Plus className="size-3.5" />
          {t("buttons.newBooking")}
        </Button>
        ) : undefined
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["all", t("dashboard.customerWorkspace.bookings.filterAll", { defaultValue: "All" })],
            [
              "operational",
              t("dashboard.customerWorkspace.bookings.filterOperational", {
                defaultValue: "Clinic / services",
              }),
            ],
            [
              "sales_demo",
              `${t("dashboard.customerWorkspace.bookings.filterDemos", {
                defaultValue: "Sales demos",
              })}${demoCount > 0 ? ` (${demoCount})` : ""}`,
            ],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKindFilter(value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
              kindFilter === value
                ? "bg-primary/15 text-primary"
                : "bg-muted/60 text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <WorkspaceInlineEmpty
          icon={CalendarDays}
          title={
            kindFilter === "sales_demo"
              ? t("dashboard.customerWorkspace.bookings.emptyDemosTitle", {
                  defaultValue: "No sales demos yet",
                })
              : t("dashboard.customerWorkspace.bookings.emptyTitle")
          }
          description={
            kindFilter === "sales_demo"
              ? t("dashboard.customerWorkspace.bookings.emptyDemosDescription", {
                  defaultValue: "Product demo bookings for this customer will appear here.",
                })
              : t("dashboard.customerWorkspace.bookings.emptyDescription")
          }
          actionLabel={kindFilter === "sales_demo" ? undefined : t("buttons.newBooking")}
          onAction={kindFilter === "sales_demo" ? undefined : onNewBooking}
        />
      ) : (
        <table className="w-full min-w-[56rem] table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-[12%] px-3 py-2.5 text-start">
                {t("dashboard.customerWorkspace.bookings.colReference")}
              </th>
              <th className="w-[14%] px-3 py-2.5 text-start">
                {t("dashboard.customerWorkspace.bookings.colService")}
              </th>
              <th className="w-[12%] px-3 py-2.5 text-start">
                {t("dashboard.customerWorkspace.bookings.colServiceType")}
              </th>
              <th className="w-[12%] px-3 py-2.5 text-start">
                {t("dashboard.customerWorkspace.bookings.colBranch")}
              </th>
              <th className="w-[14%] px-3 py-2.5 text-start">
                {t("dashboard.customerWorkspace.bookings.colChannel")}
              </th>
              <th className="w-[18%] px-3 py-2.5 text-start">
                {t("dashboard.customerWorkspace.bookings.colWhen")}
              </th>
              <th className="w-[9%] px-3 py-2.5 text-start">
                {t("dashboard.customerWorkspace.bookings.period")}
              </th>
              <th className="w-[9%] px-3 py-2.5 text-start">
                {t("dashboard.customerWorkspace.bookings.colStatus")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((booking) => {
              const bucket = groupLabel(booking);
              const isDemo = bookingServiceKind(booking) === "sales_demo";
              return (
                <tr key={booking.id} className="border-b border-border/40 hover:bg-primary/5">
                  <td className="px-3 py-2.5 text-start text-muted-foreground">
                    <span dir="ltr" className="inline-block font-mono text-xs tabular-nums">
                      {bookingReferenceNumber(booking)}
                    </span>
                    {isDemo ? (
                      <span className="ms-1.5 inline-flex rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-blue-500/15 text-blue-700 dark:text-blue-300">
                        {t("scheduling.services.kinds.sales_demo", { defaultValue: "Demo" })}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-start font-medium">{booking.service || "—"}</td>
                  <td className="px-3 py-2.5 text-start">
                    {booking.visit_type
                      ? pricingTypeLabel((key) => t(key), {
                          code: booking.visit_type,
                          label: booking.visit_type,
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-start">{booking.branch_name || "—"}</td>
                  <td className="px-3 py-2.5 text-start">{bookingChannelLabel(booking.source, (key) => t(key))}</td>
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
                    <WorkspaceStatusChip
                      tone={
                        (booking.scheduling_status ?? "").toLowerCase() === "no_show"
                          ? "danger"
                          : "muted"
                      }
                    >
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
