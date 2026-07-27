import { format } from "date-fns";
import { CalendarDays, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  WorkspaceEmptyState,
  WorkspaceListRow,
  WorkspaceSection,
  WorkspaceSkeleton,
} from "@/components/customer-workspace/workspace-ui";
import {
  filterBookingsForCustomer,
  fmtDate,
  groupBookings,
} from "@/lib/customer-workspace/customer-workspace-utils";
import type { Booking, Customer } from "@/lib/types";

type Props = {
  customer: Customer;
  bookings: Booking[];
  loading?: boolean;
  onNewBooking: () => void;
};

function BookingGroup({
  title,
  items,
  empty,
}: {
  title: string;
  items: Booking[];
  empty: string;
}) {
  return (
    <WorkspaceSection title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map((booking) => (
            <WorkspaceListRow
              key={booking.id}
              title={booking.service}
              subtitle={`${fmtDate(booking.booking_date)} · ${format(new Date(booking.booking_date), "h:mm a")}`}
              badge={booking.scheduling_status ?? booking.status}
            />
          ))}
        </div>
      )}
    </WorkspaceSection>
  );
}

export function WorkspaceBookingsTab({ customer, bookings, loading, onNewBooking }: Props) {
  const { t } = useTranslation("common");
  const customerBookings = filterBookingsForCustomer(bookings, customer.id);
  const groups = groupBookings(customerBookings);

  if (loading) return <WorkspaceSkeleton rows={6} />;

  if (customerBookings.length === 0) {
    return (
      <WorkspaceEmptyState
        icon={CalendarDays}
        title={t("dashboard.customerWorkspace.bookings.emptyTitle")}
        description={t("dashboard.customerWorkspace.bookings.emptyDescription")}
        action={
          <Button size="sm" className="gap-2" onClick={onNewBooking}>
            <Plus className="size-4" />
            {t("buttons.newBooking")}
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={onNewBooking}>
          <Plus className="size-4" />
          {t("buttons.newBooking")}
        </Button>
      </div>
      <BookingGroup
        title={t("dashboard.customerWorkspace.bookings.current")}
        items={groups.current}
        empty={t("dashboard.customerWorkspace.bookings.noCurrent")}
      />
      <BookingGroup
        title={t("dashboard.customerWorkspace.bookings.upcoming")}
        items={groups.upcoming}
        empty={t("dashboard.customerWorkspace.bookings.noUpcoming")}
      />
      <BookingGroup
        title={t("dashboard.customerWorkspace.bookings.past")}
        items={groups.past}
        empty={t("dashboard.customerWorkspace.bookings.noPast")}
      />
      <BookingGroup
        title={t("dashboard.customerWorkspace.bookings.cancelled")}
        items={groups.cancelled}
        empty={t("dashboard.customerWorkspace.bookings.noCancelled")}
      />
      <BookingGroup
        title={t("dashboard.customerWorkspace.bookings.rescheduled")}
        items={groups.rescheduled}
        empty={t("dashboard.customerWorkspace.bookings.noRescheduled")}
      />
    </div>
  );
}
