import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { BookingModal } from "@/components/dashboard/booking-modal";
import { Can } from "@/components/rbac/permission-guard";
import { CalendarShell } from "@/components/calendar/layout/calendar-shell";
import { CalendarToolbar } from "@/components/calendar/layout/calendar-toolbar";
import { CalendarNavigationControls } from "@/components/calendar/navigation/calendar-navigation-controls";
import { CalendarViewSwitcher } from "@/components/calendar/navigation/calendar-view-switcher";
import { CalendarZoomControl } from "@/components/calendar/navigation/calendar-zoom-control";
import { CalendarFilterBar } from "@/components/calendar/filters/calendar-filter-bar";
import { CalendarLoadingBoundary } from "@/components/calendar/overlays/calendar-loading-boundary";
import type { CalendarGridInteractionProps } from "@/components/calendar/interaction/calendar-interaction-types";
import type { InteractiveCalendarEventHandlers } from "@/components/calendar/interaction/interactive-calendar-event-block";
import { useAuth } from "@/context/auth-context";
import { useCustomerProfile } from "@/context/customer-profile-context";
import { useCalendarEvents } from "@/hooks/calendar/use-calendar-events";
import { useCalendarFilters } from "@/hooks/calendar/use-calendar-filters";
import { useCalendarInteraction } from "@/hooks/calendar/use-calendar-interaction";
import { useCalendarKeyboard } from "@/hooks/calendar/use-calendar-keyboard";
import { useCalendarNavigation } from "@/hooks/calendar/use-calendar-navigation";
import { useCalendarSelection } from "@/hooks/calendar/use-calendar-selection";
import { useCalendarViewState } from "@/hooks/calendar/use-calendar-view-state";
import { useCalendarZoom } from "@/hooks/calendar/use-calendar-zoom";
import { useHasPermission } from "@/hooks/use-rbac";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import {
  useSchedulingBranches,
  useSchedulingResources,
} from "@/hooks/scheduling/use-scheduling-resources";
import { calendarEventToAppBooking } from "@/lib/calendar/adapters/legacy-booking-adapter";
import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import { formatBookingDomainError } from "@/hooks/use-booking-domain";
import { useCustomersEnrichment } from "@/hooks/use-customers";
import type { Booking } from "@/lib/types";
import type { WeekdayIndex } from "@/lib/scheduling/types";
import { useRegisterFloatingAiContext } from "@/context/floating-ai-context";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";

const CalendarDayView = lazy(
  () => import("@/components/calendar/views/day/calendar-day-view").then((m) => ({ default: m.CalendarDayView })),
);
const CalendarWeekView = lazy(
  () => import("@/components/calendar/views/week/calendar-week-view").then((m) => ({ default: m.CalendarWeekView })),
);
const CalendarResourceTimelineView = lazy(
  () =>
    import("@/components/calendar/views/timeline/calendar-resource-timeline-view").then((m) => ({
      default: m.CalendarResourceTimelineView,
    })),
);
const CalendarMonthView = lazy(
  () => import("@/components/calendar/views/month/calendar-month-view").then((m) => ({ default: m.CalendarMonthView })),
);
const CalendarAgendaView = lazy(
  () => import("@/components/calendar/views/agenda/calendar-agenda-view").then((m) => ({ default: m.CalendarAgendaView })),
);

const INTERACTIVE_VIEWS = new Set(["day", "week", "timeline"]);

export function CalendarPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile, user } = useAuth();
  const { openCustomerProfile } = useCustomerProfile();
  const companyId = profile?.company_id ?? null;
  const canCreate = useHasPermission("bookings.create");
  const canEdit = useHasPermission("bookings.edit");
  const canDelete = useHasPermission("bookings.delete");

  const {
    viewState,
    setView,
    setAnchorDate,
    setDisplayTimezone,
    setWeekStartDay,
    setFilters,
    setSelection,
    setZoomLevel,
  } = useCalendarViewState();

  const { goToToday, shiftAnchor, jumpToDate } = useCalendarNavigation(viewState);
  const filterControls = useCalendarFilters({ filters: viewState.filters, setFilters });
  const { hourRowHeight, timelineHourWidth } = useCalendarZoom(viewState.timeline.zoomLevel);
  const { selectEvent, clearSelection, setOrderedEventIds } = useCalendarSelection(setSelection);

  const [scrollNonce, setScrollNonce] = useState(0);

  const {
    events,
    eventsByDay,
    isLoading,
    error,
    refetch,
    displayTimezone,
    bookingRules,
    visibleRange: queryVisibleRange,
  } = useCalendarEvents({
    companyId,
    viewState,
    permissions: { canCreate, canEdit, canDelete },
  });

  const {
    interactionState,
    hiddenEventIds,
    startDrag,
    startResize,
    updateTargetDate,
    cancelInteraction,
    cancelBooking,
    completeBooking,
  } = useCalendarInteraction({
    companyId,
    slotIntervalMinutes: bookingRules?.slot_interval_minutes ?? 15,
    onRescheduleSuccess: () => void refetch(),
  });

  const isMobile = useIsMobile();
  const mobileDefaultApplied = useRef(false);

  useEffect(() => {
    if (isMobile && !mobileDefaultApplied.current) {
      mobileDefaultApplied.current = true;
      setView("agenda");
    }
  }, [isMobile, setView]);

  useEffect(() => {
    if (isMobile && viewState.view === "timeline") {
      setView("agenda");
    }
  }, [isMobile, viewState.view, setView]);

  useEffect(() => {
    if (bookingRules?.timezone && viewState.displayTimezone !== bookingRules.timezone) {
      setDisplayTimezone(bookingRules.timezone);
    }
  }, [bookingRules?.timezone, setDisplayTimezone, viewState.displayTimezone]);

  useEffect(() => {
    if (
      bookingRules?.week_start_day != null &&
      viewState.weekStartDay !== bookingRules.week_start_day
    ) {
      setWeekStartDay(bookingRules.week_start_day as WeekdayIndex);
    }
  }, [bookingRules?.week_start_day, setWeekStartDay, viewState.weekStartDay]);

  useEffect(() => {
    setOrderedEventIds(events.map((event) => event.id));
  }, [events, setOrderedEventIds]);

  const [bookingModal, setBookingModal] = useState<{ open: boolean; booking?: Booking | null }>({
    open: false,
    booking: null,
  });

  const { data: customers = [] } = useCustomersEnrichment();
  const { data: branches = [] } = useSchedulingBranches(companyId);
  const { data: resources = [] } = useSchedulingResources(companyId);

  const floatingAiContext = useMemo(
    () => ({
      page: "calendar" as const,
      moduleLabel: t("navigation.calendar"),
      pageTitle: t("navigation.calendar"),
      selectedDate: viewState.selection.date ?? viewState.anchorDate,
      bookingId: bookingModal.booking?.id ?? viewState.selection.eventId ?? null,
      filters: viewState.filters,
      currentEntity: bookingModal.booking
        ? {
            type: "booking" as const,
            id: bookingModal.booking.id,
            label: bookingModal.booking.service ?? bookingModal.booking.id,
          }
        : null,
    }),
    [
      t,
      viewState.selection.date,
      viewState.selection.eventId,
      viewState.anchorDate,
      viewState.filters,
      bookingModal.booking,
    ],
  );

  useRegisterFloatingAiContext(floatingAiContext);

  const timelineResources = useMemo(() => {
    let list = resources.filter((resource) => resource.status === "active");
    if (viewState.filters.branchId) {
      list = list.filter((resource) => resource.branch_id === viewState.filters.branchId);
    }
    if (viewState.filters.resourceIds !== "all") {
      list = list.filter((resource) => viewState.filters.resourceIds.includes(resource.id));
    }
    return list.map((resource) => ({ id: resource.id, name: resource.name }));
  }, [resources, viewState.filters.branchId, viewState.filters.resourceIds]);

  const navigationLabel = useMemo(() => {
    if (viewState.view === "month") {
      return format(parseISO(`${viewState.anchorDate}T12:00:00`), "MMMM yyyy");
    }
    if (viewState.view === "week" || viewState.view === "agenda") {
      const start = parseISO(`${queryVisibleRange.startDate}T12:00:00`);
      const end = parseISO(`${queryVisibleRange.endDate}T12:00:00`);
      return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
    }
    return format(parseISO(`${viewState.anchorDate}T12:00:00`), "MMM d, yyyy");
  }, [viewState.view, viewState.anchorDate, queryVisibleRange.startDate, queryVisibleRange.endDate]);

  const openBooking = useCallback(
    (event: CalendarEvent) => {
      setSelection({ eventId: event.id });
      setBookingModal({
        open: true,
        booking: calendarEventToAppBooking(event, user?.id ?? ""),
      });
    },
    [setSelection, user?.id],
  );

  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      openBooking(event);
    },
    [openBooking],
  );

  const handleCompleteBooking = useCallback(
    async (event: CalendarEvent) => {
      try {
        await completeBooking.mutateAsync({
          bookingId: event.id,
          customerId: event.customer?.id ?? null,
        });
        toast({ title: t("calendar.interaction.completeSuccess") });
        void refetch();
      } catch (err) {
        toast({ title: formatBookingDomainError(err), variant: "destructive" });
      }
    },
    [completeBooking, refetch, t, toast],
  );

  const handleCancelBooking = useCallback(
    async (event: CalendarEvent) => {
      try {
        await cancelBooking.mutateAsync({
          bookingId: event.id,
          customerId: event.customer?.id ?? null,
        });
        toast({ title: t("calendar.interaction.cancelSuccess") });
        void refetch();
      } catch (err) {
        toast({ title: formatBookingDomainError(err), variant: "destructive" });
      }
    },
    [cancelBooking, refetch, t, toast],
  );

  const interactionHandlers = useMemo<InteractiveCalendarEventHandlers>(
    () => ({
      onOpenBooking: openBooking,
      onOpenCustomer: (event) => {
        if (!event.customer?.id || !companyId) return;
        openCustomerProfile({
          customerId: event.customer.id,
          context: { companyId },
        });
      },
      onReschedule: openBooking,
      onComplete: (event) => void handleCompleteBooking(event),
      onCancel: (event) => void handleCancelBooking(event),
      onSelect: (event, modifiers) => selectEvent(event.id, modifiers),
      onStartDrag: startDrag,
      onStartResize: startResize,
    }),
    [
      companyId,
      handleCancelBooking,
      handleCompleteBooking,
      openBooking,
      openCustomerProfile,
      selectEvent,
      startDrag,
      startResize,
    ],
  );

  const interactionProps = useMemo<CalendarGridInteractionProps | undefined>(() => {
    if (!INTERACTIVE_VIEWS.has(viewState.view)) return undefined;
    return {
      interactionState,
      hiddenEventIds,
      hourRowHeight,
      handlers: interactionHandlers,
      onTargetDateChange: updateTargetDate,
      onCancelInteraction: cancelInteraction,
    };
  }, [
    cancelInteraction,
    hiddenEventIds,
    hourRowHeight,
    interactionHandlers,
    interactionState,
    updateTargetDate,
    viewState.view,
  ]);

  const handleDayClick = useCallback(
    (date: string) => {
      setSelection({ date, eventId: null, resourceId: null });
      setAnchorDate(date);
      setView("day");
    },
    [setSelection, setAnchorDate, setView],
  );

  const handleAgendaLoadMore = useCallback(() => {
    setAnchorDate(shiftAnchor("next"));
  }, [setAnchorDate, shiftAnchor]);

  const handleCreateBooking = useCallback(() => {
    setBookingModal({ open: true, booking: null });
  }, []);

  const handleToday = useCallback(() => {
    setAnchorDate(goToToday());
    setScrollNonce((value) => value + 1);
  }, [goToToday, setAnchorDate]);

  const handleNavigateDay = useCallback(
    (direction: "previous" | "next") => {
      setAnchorDate(shiftAnchor(direction));
    },
    [setAnchorDate, shiftAnchor],
  );

  useCalendarKeyboard({
    enabled: INTERACTIVE_VIEWS.has(viewState.view),
    selectedEventId: viewState.selection.eventId,
    events,
    onOpenEvent: openBooking,
    onCancelEvent: (event) => void handleCancelBooking(event),
    onClearSelection: () => {
      cancelInteraction();
      clearSelection();
    },
    onNavigateDay: handleNavigateDay,
  });

  const viewContent = useMemo(() => {
    if (viewState.view === "day") {
      return (
        <CalendarDayView
          events={events}
          anchorDate={viewState.anchorDate}
          displayTimezone={displayTimezone}
          selectedEventId={viewState.selection.eventId}
          hourRowHeight={hourRowHeight}
          scrollNonce={scrollNonce}
          interaction={interactionProps}
          onCreateBooking={handleCreateBooking}
          canCreate={canCreate}
        />
      );
    }
    if (viewState.view === "week") {
      return (
        <CalendarWeekView
          events={events}
          startDate={queryVisibleRange.startDate}
          endDate={queryVisibleRange.endDate}
          weekStartDay={viewState.weekStartDay}
          displayTimezone={displayTimezone}
          selectedEventId={viewState.selection.eventId}
          hourRowHeight={hourRowHeight}
          scrollNonce={scrollNonce}
          interaction={interactionProps}
          onCreateBooking={handleCreateBooking}
          canCreate={canCreate}
        />
      );
    }
    if (viewState.view === "timeline") {
      return (
        <CalendarResourceTimelineView
          events={events}
          anchorDate={viewState.anchorDate}
          displayTimezone={displayTimezone}
          resources={timelineResources}
          timelineHourWidth={timelineHourWidth}
          selectedEventId={viewState.selection.eventId}
          scrollNonce={scrollNonce}
          interaction={interactionProps}
          onCreateBooking={handleCreateBooking}
          canCreate={canCreate}
        />
      );
    }
    if (viewState.view === "month") {
      return (
        <CalendarMonthView
          eventsByDay={eventsByDay}
          anchorDate={viewState.anchorDate}
          weekStartDay={viewState.weekStartDay}
          displayTimezone={displayTimezone}
          selectedDate={viewState.selection.date}
          selectedEventId={viewState.selection.eventId}
          onDayClick={handleDayClick}
          onEventClick={handleEventClick}
        />
      );
    }
    if (viewState.view === "agenda") {
      return (
        <CalendarAgendaView
          eventsByDay={eventsByDay}
          startDate={queryVisibleRange.startDate}
          endDate={queryVisibleRange.endDate}
          displayTimezone={displayTimezone}
          selectedEventId={viewState.selection.eventId}
          onEventClick={handleEventClick}
          onLoadMore={handleAgendaLoadMore}
          hasMore
        />
      );
    }
    return null;
  }, [
    viewState,
    events,
    eventsByDay,
    queryVisibleRange.startDate,
    queryVisibleRange.endDate,
    displayTimezone,
    hourRowHeight,
    scrollNonce,
    interactionProps,
    handleEventClick,
    handleCreateBooking,
    handleDayClick,
    handleAgendaLoadMore,
    timelineResources,
    timelineHourWidth,
    canCreate,
  ]);

  return (
    <div className="space-y-4">
      <CalendarShell
        toolbar={
          <CalendarToolbar
            title={t("calendar.title")}
            navigation={
              <CalendarNavigationControls
                anchorDate={viewState.anchorDate}
                displayTimezone={displayTimezone}
                label={navigationLabel}
                onToday={handleToday}
                onPrevious={() => setAnchorDate(shiftAnchor("previous"))}
                onNext={() => setAnchorDate(shiftAnchor("next"))}
                onJumpToDate={(date) => setAnchorDate(jumpToDate(date))}
              />
            }
            viewSwitcher={
              <CalendarViewSwitcher view={viewState.view} onViewChange={setView} />
            }
            actions={
              <>
                {INTERACTIVE_VIEWS.has(viewState.view) && (
                  <CalendarZoomControl
                    zoomLevel={viewState.timeline.zoomLevel}
                    onZoomChange={setZoomLevel}
                  />
                )}
                <Can permission="bookings.create">
                  <Button onClick={handleCreateBooking} size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    {t("buttons.newBooking")}
                  </Button>
                </Can>
              </>
            }
          />
        }
        filters={
          <CalendarFilterBar
            filters={viewState.filters}
            branches={branches.map((item) => ({ id: item.id, name: item.name }))}
            resources={resources.map((item) => ({ id: item.id, name: item.name }))}
            onBranchChange={filterControls.setBranchFilter}
            onResourceChange={filterControls.setResourceFilter}
            onToggleStatus={filterControls.toggleStatus}
            onClear={filterControls.clearFilters}
          />
        }
      >
        <CalendarLoadingBoundary
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
        >
          <Suspense fallback={<DashboardPageFallback />}>{viewContent}</Suspense>
        </CalendarLoadingBoundary>
      </CalendarShell>

      <BookingModal
        open={bookingModal.open}
        onClose={() => setBookingModal({ open: false, booking: null })}
        booking={bookingModal.booking}
        customers={customers}
        companyId={companyId}
        branchId={viewState.filters.branchId}
      />
    </div>
  );
}

export default CalendarPage;
