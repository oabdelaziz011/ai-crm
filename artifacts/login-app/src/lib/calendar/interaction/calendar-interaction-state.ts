import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";

export type CalendarInteractionMode = "idle" | "dragging" | "resizing" | "committing";

export type CalendarResizeEdge = "top" | "bottom";

export type CalendarInteractionAxis = "vertical" | "horizontal";

export type CalendarInteractionPreview = {
  eventId: string;
  date: string;
  slotStart: string;
  slotEnd: string;
  durationMinutes: number;
  resourceId?: string | null;
};

export type CalendarInteractionState = {
  mode: CalendarInteractionMode;
  axis: CalendarInteractionAxis;
  sourceEvent: CalendarEvent | null;
  preview: CalendarInteractionPreview | null;
  resizeEdge: CalendarResizeEdge | null;
  optimisticEventId: string | null;
  error: string | null;
};

export const IDLE_INTERACTION_STATE: CalendarInteractionState = {
  mode: "idle",
  axis: "vertical",
  sourceEvent: null,
  preview: null,
  resizeEdge: null,
  optimisticEventId: null,
  error: null,
};

export type CalendarInteractionCommitTarget = {
  bookingId: string;
  date: string;
  slotStart: string;
  customerId?: string | null;
};
