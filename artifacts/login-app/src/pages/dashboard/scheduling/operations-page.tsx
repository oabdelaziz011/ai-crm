import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/context/auth-context";
import { DashboardErrorBanner, DashboardPageFallback } from "@/components/dashboard/ui";
import { BookingModal } from "@/components/dashboard/booking-modal";
import { InvoiceModal } from "@/components/dashboard/invoice-modal";
import { OperationsHeader } from "@/components/scheduling/operations/operations-header";
import { OperationsKpiGrid } from "@/components/scheduling/operations/operations-kpi-grid";
import { OperationsVirtualTimeline } from "@/components/scheduling/operations/operations-virtual-timeline";
import type { TimelineDropTarget } from "@/components/scheduling/operations/operations-virtual-timeline";
import { OperationsBookingDrawer } from "@/components/scheduling/operations/operations-booking-drawer";
import { OperationsCancelModal } from "@/components/scheduling/operations/operations-cancel-modal";
import { OperationsRescheduleModal } from "@/components/scheduling/operations/operations-reschedule-modal";
import { OperationsWaitingQueuePanel } from "@/components/scheduling/operations/operations-waiting-queue-panel";
import {
  OperationsDragRescheduleDialog,
  type DragRescheduleTarget,
} from "@/components/scheduling/operations/operations-drag-reschedule-dialog";
import { useCurrentUserBranches } from "@/lib/company/branches/hooks/use-branches";
import { useSchedulingResources } from "@/hooks/scheduling/use-scheduling-resources";
import { useSchedulingServices } from "@/hooks/scheduling/use-scheduling-services";
import {
  useOperationsDayData,
  useOperationsFilters,
  useOperationsRealtime,
  useOperationsRefresh,
  useCheckInDomainBooking,
  useCancelBookingWithReason,
  useOperationsContactActions,
  useNoShowAutomation,
  formatBookingDomainError,
} from "@/lib/scheduling/operations/hooks";
import {
  useCompleteDomainBooking,
  useRescheduleDomainBooking,
  useValidateDomainBooking,
} from "@/hooks/use-booking-domain";
import { OperationsExportService } from "@/lib/scheduling/operations/services/operations-export-service";
import { OperationsRepository } from "@/lib/scheduling/operations/repositories";
import { BookingConflictEngine } from "@/lib/scheduling/operations/conflicts";
import { supabase } from "@/lib/supabase";
import { schedulingBookingToAppBooking } from "@/lib/booking/booking-view-adapter";
import type { Booking } from "@/lib/types";
import { resolveOperationsDate } from "@/lib/scheduling/operations/utilities";
import {
  localDateTimeToInstantIso,
  addMinutesToInstantIso,
} from "@/lib/scheduling/booking-domain/booking-time-utils";
import { getBookingNotificationDispatcher } from "@/lib/scheduling/operations/notifications";
import { useCustomersEnrichment } from "@/hooks/use-customers";
import type { BookingConflictDetail } from "@/lib/scheduling/operations/conflicts";

const exportService = new OperationsExportService(new OperationsRepository(supabase));

export function OperationsPage() {
  const { t } = useTranslation("common");
  const { profile, user } = useAuth();
  const companyId = profile?.company_id ?? null;
  const timezone = "UTC";

  const { filters, updateFilters } = useOperationsFilters();
  const { data, isLoading, error } = useOperationsDayData(companyId, filters, timezone);
  const { refresh, isRefreshing } = useOperationsRefresh(companyId, filters, timezone);
  useOperationsRealtime(companyId);
  useNoShowAutomation(companyId, data?.bookings ?? [], Boolean(data));

  const { data: branches = [] } = useCurrentUserBranches(companyId);
  const { data: resources = [] } = useSchedulingResources(companyId);
  const { data: services = [] } = useSchedulingServices(companyId);
  const { data: customers = [] } = useCustomersEnrichment();

  const checkIn = useCheckInDomainBooking(companyId);
  const cancelBooking = useCancelBookingWithReason(companyId);
  const completeBooking = useCompleteDomainBooking(companyId);
  const rescheduleBooking = useRescheduleDomainBooking(companyId);
  const validateBooking = useValidateDomainBooking(companyId);
  const { callCustomer, openWhatsapp } = useOperationsContactActions(companyId);

  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [dragTarget, setDragTarget] = useState<DragRescheduleTarget | null>(null);
  const [dragConflicts, setDragConflicts] = useState<BookingConflictDetail[]>([]);
  const [dragDialogOpen, setDragDialogOpen] = useState(false);

  const selectedBooking = useMemo(
    () => data?.bookings.find((booking) => booking.id === selectedBookingId) ?? null,
    [data?.bookings, selectedBookingId],
  );

  const actionPending =
    checkIn.isPending ||
    cancelBooking.isPending ||
    completeBooking.isPending ||
    rescheduleBooking.isPending;

  const handleExport = async () => {
    if (!companyId) return;
    const date = resolveOperationsDate(filters.datePreset, filters.date);
    try {
      await exportService.exportDayBookings(
        {
          companyId,
          date,
          timezone,
          branchId: filters.branchId,
          resourceIds: filters.resourceIds.length ? filters.resourceIds : undefined,
          serviceIds: filters.serviceIds.length ? filters.serviceIds : undefined,
          statuses: filters.statuses.length ? filters.statuses : undefined,
        },
        timezone,
        `operations-${date}.csv`,
      );
      toast.success(t("scheduling.operations.exportSuccess"));
    } catch (err) {
      toast.error(formatBookingDomainError(err));
    }
  };

  const toLegacyBooking = (booking: NonNullable<typeof selectedBooking>): Booking => {
    return schedulingBookingToAppBooking(
      {
        id: booking.id,
        company_id: booking.companyId,
        branch_id: booking.branchId,
        customer_id: booking.customerId,
        resource_id: booking.resourceId,
        service_id: booking.serviceId,
        start_at: booking.startAt,
        end_at: booking.endAt,
        timezone: booking.timezone,
        status: booking.status,
        source: "crm",
        notes: booking.notes,
        rescheduled_from_id: null,
        version: 1,
        created_by: booking.createdBy,
        updated_by: null,
        created_at: booking.createdAt,
        updated_at: booking.updatedAt,
        deleted_at: null,
        customers: booking.customer
          ? { id: booking.customer.id, name: booking.customer.name }
          : null,
        scheduling_services: booking.service
          ? {
              id: booking.service.id,
              name: booking.service.name,
              duration_minutes: booking.service.durationMinutes,
            }
          : null,
        scheduling_resources: booking.resource
          ? { id: booking.resource.id, name: booking.resource.name }
          : null,
      },
      profile?.id ?? user?.id ?? "",
    );
  };

  const handleQuickAction = async (
    action: "call" | "whatsapp" | "edit",
    bookingId: string,
  ) => {
    const booking = data?.bookings.find((item) => item.id === bookingId);
    if (!booking) return;

    try {
      if (action === "call") {
        callCustomer(booking.customer?.phone);
      } else if (action === "whatsapp") {
        await openWhatsapp(booking, () => setSelectedBookingId(null));
      } else {
        setEditBooking(toLegacyBooking(booking));
      }
    } catch (err) {
      toast.error(formatBookingDomainError(err));
    }
  };

  const handleTimelineDrop = async ({ slot, bookingId }: TimelineDropTarget) => {
    const booking = data?.bookings.find((b) => b.id === bookingId);
    if (!booking || !data) return;

    const startAt = localDateTimeToInstantIso(data.date, slot.startTime, booking.timezone);
    const endAt = addMinutesToInstantIso(startAt, booking.durationMinutes);

    const localConflict = BookingConflictEngine.detectLocalOverlap(data.bookings, {
      bookingId: booking.id,
      resourceId: booking.resourceId,
      resourceType: booking.resource?.type ?? "other",
      serviceId: booking.serviceId,
      startAt,
      endAt,
    });

    let domainConflicts: BookingConflictDetail[] = [];
    if (localConflict.valid) {
      try {
        const validation = await validateBooking.mutateAsync({
          customerId: booking.customerId,
          resourceId: booking.resourceId,
          serviceId: booking.serviceId,
          date: data.date,
          slotStart: slot.startTime,
        });
        if (!validation.valid) {
          domainConflicts = BookingConflictEngine.fromValidationErrors(
            validation.errors,
            booking.resource?.type,
          ).conflicts;
        }
      } catch (err) {
        toast.error(formatBookingDomainError(err));
        return;
      }
    }

    const conflicts = [...localConflict.conflicts, ...domainConflicts];

    setDragTarget({
      bookingId: booking.id,
      date: data.date,
      slotStart: slot.startTime,
      slotEnd: slot.endTime,
      customerName: booking.customer?.name ?? "—",
      serviceName: booking.service?.name ?? "—",
    });
    setDragConflicts(conflicts);
    setDragDialogOpen(true);
  };

  const confirmDragReschedule = async () => {
    if (!dragTarget) return;
    const booking = data?.bookings.find((b) => b.id === dragTarget.bookingId);
    if (!booking) return;

    try {
      const result = await rescheduleBooking.mutateAsync({
        bookingId: dragTarget.bookingId,
        date: dragTarget.date,
        slotStart: dragTarget.slotStart,
        customerId: booking.customerId,
      });
      try {
        await getBookingNotificationDispatcher().dispatch({
          channel: "email",
          event: "booking_rescheduled",
          payload: {
            companyId: booking.companyId,
            bookingId: result.booking.id,
            customerId: booking.customerId,
            customerName: booking.customer?.name ?? "",
            customerPhone: booking.customer?.phone ?? null,
            customerEmail: booking.customer?.email ?? null,
            serviceName: booking.service?.name ?? "",
            resourceName: booking.resource?.name ?? "",
            startAt: result.booking.start_at,
            timezone: result.booking.timezone,
          },
        });
      } catch {
        // optional
      }
      toast.success(t("scheduling.operations.rescheduleSuccess"));
      setDragDialogOpen(false);
      setDragTarget(null);
      setSelectedBookingId(result.booking.id);
    } catch (err) {
      toast.error(formatBookingDomainError(err));
    }
  };

  if (isLoading && !data) {
    return <DashboardPageFallback />;
  }

  return (
    <div className="space-y-5 bg-background">
      <OperationsHeader
        filters={filters}
        onFiltersChange={updateFilters}
        branches={branches}
        resources={resources}
        services={services}
        onRefresh={refresh}
        onExport={() => void handleExport()}
        isRefreshing={isRefreshing}
        exportDisabled={!companyId}
      />

      {error ? <DashboardErrorBanner message={error.message} /> : null}

      <OperationsKpiGrid
        kpis={
          data?.kpis ?? {
            bookings: 0,
            availableSlots: 0,
            cancelled: 0,
            completed: 0,
            checkedIn: 0,
            occupancyPercent: 0,
            expectedRevenueCents: 0,
            actualRevenueCents: 0,
          }
        }
        loading={isLoading}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="border border-border bg-background p-4">
          <h2 className="mb-3 text-sm font-semibold">
            {t("scheduling.operations.timeline.title")}
          </h2>
          <OperationsVirtualTimeline
            slots={data?.timelineSlots ?? []}
            onSelectBooking={setSelectedBookingId}
            onQuickAction={(action, bookingId) => void handleQuickAction(action, bookingId)}
            onDropBooking={(target) => void handleTimelineDrop(target)}
          />
        </div>

        <OperationsWaitingQueuePanel
          entries={data?.waitingQueue ?? []}
          bookings={data?.bookings ?? []}
          onSelectBooking={setSelectedBookingId}
          loading={isLoading}
        />
      </div>

      <OperationsBookingDrawer
        booking={selectedBooking}
        open={Boolean(selectedBooking)}
        onClose={() => setSelectedBookingId(null)}
        actionPending={actionPending}
        onCall={() => {
          if (!selectedBooking) return;
          try {
            callCustomer(selectedBooking.customer?.phone);
          } catch (err) {
            toast.error(formatBookingDomainError(err));
          }
        }}
        onWhatsapp={() => {
          if (!selectedBooking) return;
          void openWhatsapp(selectedBooking, () => setSelectedBookingId(null));
        }}
        onEdit={() => selectedBooking && setEditBooking(toLegacyBooking(selectedBooking))}
        onReschedule={() => setRescheduleOpen(true)}
        onCancel={() => setCancelOpen(true)}
        onCheckIn={() => {
          if (!selectedBooking) return;
          checkIn.mutate(
            { bookingId: selectedBooking.id, customerId: selectedBooking.customerId },
            {
              onSuccess: () => toast.success(t("scheduling.operations.checkInSuccess")),
              onError: (err) => toast.error(formatBookingDomainError(err)),
            },
          );
        }}
        onComplete={() => {
          if (!selectedBooking) return;
          completeBooking.mutate(
            { bookingId: selectedBooking.id, customerId: selectedBooking.customerId },
            {
              onSuccess: () => toast.success(t("scheduling.operations.completeSuccess")),
              onError: (err) => toast.error(formatBookingDomainError(err)),
            },
          );
        }}
        onInvoice={() => setInvoiceOpen(true)}
      />

      <OperationsDragRescheduleDialog
        open={dragDialogOpen}
        target={dragTarget}
        conflicts={dragConflicts}
        loading={rescheduleBooking.isPending}
        onClose={() => {
          setDragDialogOpen(false);
          setDragTarget(null);
          setDragConflicts([]);
        }}
        onConfirm={() => void confirmDragReschedule()}
      />

      <OperationsCancelModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        loading={cancelBooking.isPending}
        onConfirm={async ({ reason, notes }) => {
          if (!selectedBooking) return;
          await cancelBooking.mutateAsync({
            bookingId: selectedBooking.id,
            customerId: selectedBooking.customerId,
            reason,
            notes,
          });
          toast.success(t("scheduling.operations.cancelSuccess"));
          setCancelOpen(false);
        }}
      />

      <OperationsRescheduleModal
        open={rescheduleOpen}
        booking={selectedBooking}
        companyId={companyId}
        loading={rescheduleBooking.isPending}
        onClose={() => setRescheduleOpen(false)}
        onConfirm={async ({ date, slotStart }) => {
          if (!selectedBooking) return;
          const result = await rescheduleBooking.mutateAsync({
            bookingId: selectedBooking.id,
            date,
            slotStart,
            customerId: selectedBooking.customerId,
          });
          toast.success(t("scheduling.operations.rescheduleSuccess"));
          setRescheduleOpen(false);
          setSelectedBookingId(result.booking.id);
        }}
      />

      <BookingModal
        open={Boolean(editBooking)}
        onClose={() => setEditBooking(null)}
        booking={editBooking ?? undefined}
        customers={customers}
        companyId={companyId ?? undefined}
      />

      <InvoiceModal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        customers={customers}
        defaultCustomerId={selectedBooking?.customerId ?? null}
        lockCustomer={Boolean(selectedBooking)}
      />
    </div>
  );
}
