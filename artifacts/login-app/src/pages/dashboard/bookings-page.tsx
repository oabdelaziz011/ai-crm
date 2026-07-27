import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, Clock, AlertCircle, CheckCircle2, Plus, Download, Pencil, Trash2,
} from "lucide-react";
import { useCustomerProfile } from "@/context/customer-profile-context";
import { useAuth } from "@/context/auth-context";
import { useBookings, useDeleteBooking } from "@/hooks/use-bookings";
import { useCustomers } from "@/hooks/use-customers";
import { BookingModal } from "@/components/dashboard/booking-modal";
import { DeleteDialog } from "@/components/dashboard/delete-dialog";
import { Can } from "@/components/rbac/permission-guard";
import { useHasPermission } from "@/hooks/use-rbac";
import type { Booking } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { queryShellStateFromQuery } from "@/lib/react-query/query-shell-state";
import { QueryRefreshIndicator } from "@/components/ui/query-refresh-indicator";
import { useRegisterFloatingAiContext } from "@/context/floating-ai-context";
import {
  DashboardCard,
  DashboardStatCard,
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";

export default function BookingsPage() {
  const { t } = useTranslation("common");
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { openCustomerProfile } = useCustomerProfile();
  const bookingsQuery = useBookings();
  const { data: bookings = [], error } = bookingsQuery;
  const bookingsShell = queryShellStateFromQuery(bookingsQuery);
  const { data: customers = [] } = useCustomers();
  const deleteBooking = useDeleteBooking();
  const canCreateBookings = useHasPermission("bookings.create");
  const canEditBookings = useHasPermission("bookings.edit");
  const canDeleteBookings = useHasPermission("bookings.delete");
  const [modal, setModal] = useState<{ open: boolean; booking?: Booking | null }>({ open: false });
  const [del, setDel] = useState<Booking | null>(null);

  const now = new Date();
  const today = bookings.filter((booking: Booking) => {
    const d = new Date(booking.booking_date);
    return d.toDateString() === now.toDateString();
  });
  const pending  = bookings.filter((booking: Booking) => booking.status === "Pending");
  const confirmed = bookings.filter((booking: Booking) => booking.status === "Confirmed");

  const floatingAiContext = useMemo(
    () => ({
      page: "bookings" as const,
      moduleLabel: t("navigation.bookings"),
      pageTitle: t("dashboard.bookings.title"),
      bookingId: modal.booking?.id ?? null,
      filters: { today: today.length, pending: pending.length, confirmed: confirmed.length },
      selectedBooking: modal.booking
        ? { id: modal.booking.id, label: modal.booking.service ?? modal.booking.id }
        : null,
      currentEntity: modal.booking
        ? {
            type: "booking" as const,
            id: modal.booking.id,
            label: modal.booking.service ?? modal.booking.id,
          }
        : null,
    }),
    [t, modal.booking, today.length, pending.length, confirmed.length],
  );

  useRegisterFloatingAiContext(floatingAiContext);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("dashboard.bookings.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dashboard.bookings.subtitle")}</p>
        </div>
        <QueryRefreshIndicator active={bookingsShell.isBackgroundRefresh} />
        <Can permission="bookings.create">
          <Button onClick={() => setModal({ open: true, booking: null })} className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary gap-2">
            <Plus className="w-4 h-4" /> {t("buttons.newBooking")}
          </Button>
        </Can>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardStatCard label={t("dashboard.bookings.stats.total")}       value={bookings.length}   icon={CalendarDays} loading={bookingsShell.isInitialLoad} />
        <DashboardStatCard label={t("dashboard.bookings.stats.today")}       value={today.length}      icon={Clock}        loading={bookingsShell.isInitialLoad} />
        <DashboardStatCard label={t("dashboard.bookings.stats.pending")}     value={pending.length}    icon={AlertCircle}  loading={bookingsShell.isInitialLoad} />
        <DashboardStatCard label={t("dashboard.bookings.stats.confirmed")}   value={confirmed.length}  icon={CheckCircle2} loading={bookingsShell.isInitialLoad} />
      </div>

      {error && <DashboardErrorBanner message={error.message} />}

      <DashboardCard className="overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-semibold text-sm">{t("dashboard.bookings.all")}</h3>
          <Button variant="outline" size="sm" className="border-white/10 text-xs gap-2">
            <Download className="w-3.5 h-3.5" /> {t("buttons.export")}
          </Button>
        </div>
        {bookingsShell.isInitialLoad ? <DashboardTableSkeleton /> : bookings.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            {t("dashboard.bookings.empty")}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {bookings.map((booking: Booking) => (
              <div key={booking.id} className="flex items-center px-6 py-4 hover:bg-white/[0.02] transition-colors gap-4">
                <div className="hidden sm:flex flex-col items-center justify-center w-10 text-center shrink-0">
                  <span className="text-[10px] text-muted-foreground font-mono uppercase">
                    {format(new Date(booking.booking_date), "MMM")}
                  </span>
                  <span className="text-lg font-bold leading-tight">
                    {format(new Date(booking.booking_date), "d")}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    className="text-sm font-medium text-left hover:text-primary transition-colors truncate block w-full"
                    disabled={!booking.customer_id}
                    onClick={() => {
                      if (!booking.customer_id) return;
                      openCustomerProfile({
                        customerId: booking.customer_id,
                        context: { companyId },
                      });
                    }}
                  >
                    {booking.customers?.name ?? "—"}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {booking.service} · {format(new Date(booking.booking_date), "h:mm a")}
                  </p>
                </div>
                <span className={`text-xs font-mono px-2.5 py-1 rounded-full border ${
                  booking.status === "Confirmed"  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                  booking.status === "Pending"    ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
                                              "border-rose-500/30 bg-rose-500/10 text-rose-400"
                }`}>{t(`status.${booking.status.toLowerCase()}`)}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {canEditBookings && (
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setModal({ open: true, booking })}>
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  )}
                  {canDeleteBookings && (
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setDel(booking)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      <BookingModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        booking={modal.booking}
        customers={customers}
        companyId={companyId}
      />
      <DeleteDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => {
          if (!del || !canDeleteBookings) return;
          deleteBooking.mutate(
            {
              id: del.id,
              isSchedulingBooking: del.isSchedulingBooking,
              customerId: del.customer_id,
            },
            { onSuccess: () => setDel(null) },
          );
        }}
        isPending={deleteBooking.isPending}
        itemName={del?.service}
      />
    </div>
  );
}
