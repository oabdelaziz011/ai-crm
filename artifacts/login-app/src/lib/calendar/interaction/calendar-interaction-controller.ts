import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import {
  horizontalDeltaToMinutes,
  minutesToDisplayTime,
  snapMinutes,
  verticalDeltaToMinutes,
} from "@/lib/calendar/interaction/calendar-interaction-math";
import type {
  CalendarInteractionAxis,
  CalendarInteractionCommitTarget,
  CalendarInteractionPreview,
  CalendarInteractionState,
  CalendarResizeEdge,
} from "@/lib/calendar/interaction/calendar-interaction-state";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  displayTimeToMinutes,
} from "@/lib/calendar/constants/calendar-time-grid-config";

export type CalendarInteractionControllerOptions = {
  slotIntervalMinutes?: number;
  startHour?: number;
  endHour?: number;
};

export type DragStartInput = {
  event: CalendarEvent;
  date: string;
  axis: CalendarInteractionAxis;
  pointerStartMinutes: number;
};

export type ResizeStartInput = {
  event: CalendarEvent;
  date: string;
  axis: CalendarInteractionAxis;
  edge: CalendarResizeEdge;
};

export type InteractionUpdateInput = {
  deltaPx: number;
  gridSizePx: number;
  targetDate?: string;
};

/**
 * Coordinates drag/resize UX state and commit targets.
 * No business validation — delegates to BookingDomainService via hooks.
 */
export class CalendarInteractionController {
  private state: CalendarInteractionState = { ...getIdleState() };
  private originDate = "";
  private originSlotStart = "";
  private originDuration = 0;
  private pointerOriginMinutes = 0;

  constructor(private readonly options: CalendarInteractionControllerOptions = {}) {}

  getState(): CalendarInteractionState {
    return this.state;
  }

  startDrag(input: DragStartInput): CalendarInteractionState {
    this.originDate = input.date;
    this.originSlotStart = input.event.displayStart;
    this.originDuration = input.event.durationMinutes;
    this.pointerOriginMinutes = input.pointerStartMinutes;
    this.state = {
      mode: "dragging",
      axis: input.axis,
      sourceEvent: input.event,
      preview: this.buildPreview(input.event, input.date, input.event.displayStart),
      resizeEdge: null,
      optimisticEventId: null,
      error: null,
    };
    return this.state;
  }

  startResize(input: ResizeStartInput): CalendarInteractionState {
    this.originDate = input.date;
    this.originSlotStart = input.event.displayStart;
    this.originDuration = input.event.durationMinutes;
    this.state = {
      mode: "resizing",
      axis: input.axis,
      sourceEvent: input.event,
      preview: this.buildPreview(input.event, input.date, input.event.displayStart),
      resizeEdge: input.edge,
      optimisticEventId: null,
      error: null,
    };
    return this.state;
  }

  update(input: InteractionUpdateInput): CalendarInteractionState {
    if (this.state.mode === "idle" || !this.state.sourceEvent) return this.state;

    const interval = this.options.slotIntervalMinutes ?? 15;
    const startHour = this.options.startHour ?? CALENDAR_DAY_START_HOUR;
    const endHour = this.options.endHour ?? CALENDAR_DAY_END_HOUR;
    const dayStart = startHour * 60;
    const dayEnd = endHour * 60;

    const deltaMinutes =
      this.state.axis === "vertical"
        ? verticalDeltaToMinutes(input.deltaPx, input.gridSizePx, startHour, endHour)
        : horizontalDeltaToMinutes(input.deltaPx, input.gridSizePx, startHour, endHour);

    let slotStartMinutes = displayTimeToMinutes(this.originSlotStart);
    let durationMinutes = this.originDuration;

    if (this.state.mode === "dragging") {
      slotStartMinutes = snapMinutes(
        this.pointerOriginMinutes + deltaMinutes,
        interval,
      );
    } else if (this.state.mode === "resizing" && this.state.resizeEdge === "top") {
      slotStartMinutes = snapMinutes(
        displayTimeToMinutes(this.originSlotStart) + deltaMinutes,
        interval,
      );
      const originEnd =
        displayTimeToMinutes(this.originSlotStart) + this.originDuration;
      durationMinutes = Math.max(interval, originEnd - slotStartMinutes);
    } else if (this.state.mode === "resizing" && this.state.resizeEdge === "bottom") {
      const originStart = displayTimeToMinutes(this.originSlotStart);
      const endMinutes = snapMinutes(originStart + this.originDuration + deltaMinutes, interval);
      durationMinutes = Math.max(interval, endMinutes - originStart);
      slotStartMinutes = endMinutes - durationMinutes;
    }

    slotStartMinutes = Math.max(dayStart, Math.min(slotStartMinutes, dayEnd - durationMinutes));
    const slotStart = minutesToDisplayTime(slotStartMinutes);
    const slotEnd = minutesToDisplayTime(slotStartMinutes + durationMinutes);
    const date = input.targetDate ?? this.originDate;

    this.state = {
      ...this.state,
      preview: this.buildPreview(this.state.sourceEvent, date, slotStart, durationMinutes, slotEnd),
      error: null,
    };
    return this.state;
  }

  beginCommit(): CalendarInteractionCommitTarget | null {
    const preview = this.state.preview;
    const sourceEvent = this.state.sourceEvent;
    if (!preview || !sourceEvent) return null;
    this.state = {
      ...this.state,
      mode: "committing",
      optimisticEventId: sourceEvent.id,
    };
    return {
      bookingId: sourceEvent.id,
      date: preview.date,
      slotStart: preview.slotStart,
      customerId: sourceEvent.customer?.id ?? null,
    };
  }

  commitSuccess(): CalendarInteractionState {
    this.reset();
    return this.state;
  }

  commitFailure(message: string): CalendarInteractionState {
    this.state = {
      ...getIdleState(),
      error: message,
    };
    return this.state;
  }

  cancel(): CalendarInteractionState {
    this.reset();
    return this.state;
  }

  clearError(): void {
    if (this.state.error) {
      this.state = { ...this.state, error: null };
    }
  }

  private buildPreview(
    event: CalendarEvent,
    date: string,
    slotStart: string,
    durationMinutes = event.durationMinutes,
    slotEnd?: string,
  ): CalendarInteractionPreview {
    const endMinutes = displayTimeToMinutes(slotStart) + durationMinutes;
    return {
      eventId: event.id,
      date,
      slotStart,
      slotEnd: slotEnd ?? minutesToDisplayTime(endMinutes),
      durationMinutes,
      resourceId: event.resource?.id ?? null,
    };
  }

  private reset(): void {
    this.state = { ...getIdleState() };
    this.originDate = "";
    this.originSlotStart = "";
    this.originDuration = 0;
    this.pointerOriginMinutes = 0;
  }
}

function getIdleState(): CalendarInteractionState {
  return {
    mode: "idle",
    axis: "vertical",
    sourceEvent: null,
    preview: null,
    resizeEdge: null,
    optimisticEventId: null,
    error: null,
  };
}
