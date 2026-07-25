import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarInteractionController } from "@/lib/calendar/interaction/calendar-interaction-controller";
import type { CalendarInteractionState } from "@/lib/calendar/interaction/calendar-interaction-state";
import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import {
  useCancelDomainBooking,
  useCompleteDomainBooking,
  useRescheduleDomainBooking,
  formatBookingDomainError,
} from "@/hooks/use-booking-domain";
import { useToast } from "@/hooks/use-toast";

export type UseCalendarInteractionOptions = {
  companyId: string | null;
  slotIntervalMinutes?: number;
  onRescheduleSuccess?: () => void;
};

export function useCalendarInteraction({
  companyId,
  slotIntervalMinutes = 15,
  onRescheduleSuccess,
}: UseCalendarInteractionOptions) {
  const { toast } = useToast();
  const controllerRef = useRef(
    new CalendarInteractionController({ slotIntervalMinutes }),
  );
  const activePointerRef = useRef<{
    y: number;
    x: number;
    axis: "vertical" | "horizontal";
    gridSizePx: number;
    targetDate?: string;
  } | null>(null);

  const [interactionState, setInteractionState] = useState<CalendarInteractionState>(
    controllerRef.current.getState(),
  );

  const reschedule = useRescheduleDomainBooking(companyId);
  const cancelBooking = useCancelDomainBooking(companyId);
  const completeBooking = useCompleteDomainBooking(companyId);

  const sync = useCallback(() => {
    setInteractionState({ ...controllerRef.current.getState() });
  }, []);

  const commitInteraction = useCallback(async () => {
    const target = controllerRef.current.beginCommit();
    sync();
    if (!target) return;

    try {
      await reschedule.mutateAsync({
        bookingId: target.bookingId,
        date: target.date,
        slotStart: target.slotStart,
        customerId: target.customerId,
      });
      controllerRef.current.commitSuccess();
      sync();
      onRescheduleSuccess?.();
    } catch (error) {
      const message = formatBookingDomainError(error);
      controllerRef.current.commitFailure(message);
      sync();
      toast({ title: message, variant: "destructive" });
    }
  }, [onRescheduleSuccess, reschedule, sync, toast]);

  const cancelInteraction = useCallback(() => {
    controllerRef.current.cancel();
    sync();
  }, [sync]);

  useEffect(() => {
    if (interactionState.mode !== "dragging" && interactionState.mode !== "resizing") {
      return undefined;
    }

    const onMove = (event: PointerEvent) => {
      if (!activePointerRef.current) return;
      const delta =
        activePointerRef.current.axis === "vertical"
          ? event.clientY - activePointerRef.current.y
          : event.clientX - activePointerRef.current.x;
      controllerRef.current.update({
        deltaPx: delta,
        gridSizePx: activePointerRef.current.gridSizePx,
        targetDate: activePointerRef.current.targetDate,
      });
      sync();
    };

    const onUp = () => {
      const mode = controllerRef.current.getState().mode;
      if (mode === "dragging" || mode === "resizing") {
        void commitInteraction();
      }
      activePointerRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [commitInteraction, interactionState.mode, sync]);

  const startDrag = useCallback(
    (
      event: CalendarEvent,
      date: string,
      axis: "vertical" | "horizontal",
      pointerMinutes: number,
      gridSizePx: number,
      clientX: number,
      clientY: number,
    ) => {
      if (!event.isDraggable) return;
      controllerRef.current.startDrag({
        event,
        date,
        axis,
        pointerStartMinutes: pointerMinutes,
      });
      activePointerRef.current = { y: clientY, x: clientX, axis, gridSizePx, targetDate: date };
      sync();
    },
    [sync],
  );

  const startResize = useCallback(
    (
      event: CalendarEvent,
      date: string,
      axis: "vertical" | "horizontal",
      edge: "top" | "bottom",
      gridSizePx: number,
      clientX: number,
      clientY: number,
    ) => {
      if (!event.isResizable) return;
      controllerRef.current.startResize({ event, date, axis, edge });
      activePointerRef.current = { y: clientY, x: clientX, axis, gridSizePx, targetDate: date };
      sync();
    },
    [sync],
  );

  const updateTargetDate = useCallback((targetDate: string) => {
    if (activePointerRef.current) {
      activePointerRef.current.targetDate = targetDate;
    }
  }, []);

  const isPending = reschedule.isPending || interactionState.mode === "committing";

  const hiddenEventIds = useMemo(() => {
    const ids = new Set<string>();
    if (interactionState.sourceEvent && interactionState.mode !== "idle") {
      ids.add(interactionState.sourceEvent.id);
    }
    return ids;
  }, [interactionState.mode, interactionState.sourceEvent]);

  return {
    interactionState,
    hiddenEventIds,
    isPending,
    startDrag,
    startResize,
    updateTargetDate,
    cancelInteraction,
    commitInteraction,
    cancelBooking,
    completeBooking,
  };
}
