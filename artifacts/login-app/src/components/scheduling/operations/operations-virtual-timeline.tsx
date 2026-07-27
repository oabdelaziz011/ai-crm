import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import { GripVertical, MessageCircle, Pencil, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { SchedulingBookingStatus } from "@/lib/scheduling/booking-domain";
import type { OperationsTimelineSlot } from "@/lib/scheduling/operations/types";
import { OPERATIONS_SLOT_COLORS } from "@/lib/scheduling/operations/utilities";
import {
  computeVirtualWindow,
  stickyTimeLabelForSlot,
  OPERATIONS_TIMELINE_ROW_HEIGHT,
} from "@/lib/scheduling/operations/virtualization";
import { canRescheduleOperationsBooking } from "@/lib/scheduling/operations";
import { useAuthUser } from "@/hooks/use-rbac";

export type TimelineDropTarget = {
  slot: OperationsTimelineSlot;
  bookingId: string;
};

type OperationsVirtualTimelineProps = {
  slots: OperationsTimelineSlot[];
  onSelectBooking: (bookingId: string) => void;
  onQuickAction?: (action: "call" | "whatsapp" | "edit", bookingId: string) => void;
  onDropBooking?: (target: TimelineDropTarget) => void;
};

const VIEWPORT_HEIGHT = 520;

export function OperationsVirtualTimeline({
  slots,
  onSelectBooking,
  onQuickAction,
  onDropBooking,
}: OperationsVirtualTimelineProps) {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const permCtx = useMemo(() => ({ hasPermission, isSuperAdmin }), [hasPermission, isSuperAdmin]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const window = useMemo(
    () => computeVirtualWindow(slots.length, scrollTop, VIEWPORT_HEIGHT),
    [slots.length, scrollTop],
  );

  const visibleSlots = useMemo(
    () => slots.slice(window.startIndex, window.endIndex),
    [slots, window.startIndex, window.endIndex],
  );

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollTop(scrollRef.current.scrollTop);
    }
  }, []);

  const handleDragStart = useCallback(
    (event: DragEvent, bookingId: string, status: SchedulingBookingStatus) => {
      if (!canRescheduleOperationsBooking(status, permCtx)) {
        event.preventDefault();
        return;
      }
      setDraggingId(bookingId);
      event.dataTransfer.setData("text/booking-id", bookingId);
      event.dataTransfer.effectAllowed = "move";
    },
    [permCtx],
  );

  const handleDragOver = useCallback((event: DragEvent, slot: OperationsTimelineSlot) => {
    if (!draggingId || slot.booking) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, [draggingId]);

  const handleDrop = useCallback(
    (event: DragEvent, slot: OperationsTimelineSlot) => {
      event.preventDefault();
      const bookingId = event.dataTransfer.getData("text/booking-id") || draggingId;
      setDraggingId(null);
      if (!bookingId || slot.booking || !onDropBooking) return;
      onDropBooking({ slot, bookingId });
    },
    [draggingId, onDropBooking],
  );

  if (slots.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-background/30 p-8 text-center text-sm text-muted-foreground">
        {t("scheduling.operations.timeline.empty")}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="relative max-h-[520px] overflow-y-auto scroll-smooth rounded-xl border border-white/10"
      onScroll={handleScroll}
      role="list"
      aria-label={t("scheduling.operations.timeline.title")}
    >
      <div style={{ height: window.totalHeight, position: "relative" }}>
        <div
          style={{
            transform: `translateY(${window.offsetY}px)`,
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleSlots.map((slot, index) => {
            const absoluteIndex = window.startIndex + index;
            const prevSlot = absoluteIndex > 0 ? slots[absoluteIndex - 1] : undefined;
            const showSticky = stickyTimeLabelForSlot(slot.startTime, prevSlot?.startTime);
            const colors = OPERATIONS_SLOT_COLORS[slot.kind];
            const booking = slot.booking;
            const canDrag =
              booking &&
              canRescheduleOperationsBooking(booking.status, permCtx);

            return (
              <div
                key={slot.id}
                style={{ height: OPERATIONS_TIMELINE_ROW_HEIGHT }}
                className="px-2 py-1"
                role="listitem"
                onDragOver={(e) => handleDragOver(e, slot)}
                onDrop={(e) => handleDrop(e, slot)}
              >
                {showSticky ? (
                  <div
                    className="sticky top-0 z-10 -mx-2 mb-1 bg-background/90 px-4 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur"
                    aria-hidden
                  >
                    {slot.startTime.slice(0, 2)}:00
                  </div>
                ) : null}

                <div
                  className={`group flex h-[calc(100%-1rem)] items-center gap-2 rounded-xl border p-2 transition-colors ${colors.bg} ${colors.border} ${
                    booking ? "cursor-pointer hover:brightness-110" : ""
                  } ${draggingId && !slot.booking ? "ring-1 ring-dashed ring-primary/40" : ""}`}
                  draggable={Boolean(canDrag)}
                  onDragStart={(e) => booking && handleDragStart(e, booking.id, booking.status)}
                  onDragEnd={() => setDraggingId(null)}
                  onClick={() => booking && onSelectBooking(booking.id)}
                  onKeyDown={(e) => {
                    if (booking && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onSelectBooking(booking.id);
                    }
                  }}
                  role={booking ? "button" : undefined}
                  tabIndex={booking ? 0 : undefined}
                  aria-label={
                    booking
                      ? t("scheduling.operations.timeline.bookingAria", {
                          customer: booking.customer?.name ?? "",
                          time: `${slot.startTime}-${slot.endTime}`,
                        })
                      : t("scheduling.operations.timeline.availableAt", { time: slot.startTime })
                  }
                >
                  {canDrag ? (
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" aria-hidden />
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}

                  <div className="w-20 shrink-0 font-mono text-xs">
                    {slot.startTime}–{slot.endTime}
                  </div>

                  {booking ? (
                    <>
                      <div className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{booking.customer?.name ?? "—"}</span>
                        <span className="mx-1 text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{booking.service?.name}</span>
                      </div>
                      {onQuickAction ? (
                        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            aria-label={t("scheduling.operations.actions.call")}
                            onClick={(e) => {
                              e.stopPropagation();
                              onQuickAction("call", booking.id);
                            }}
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            aria-label={t("scheduling.operations.actions.whatsapp")}
                            onClick={(e) => {
                              e.stopPropagation();
                              onQuickAction("whatsapp", booking.id);
                            }}
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            aria-label={t("scheduling.operations.actions.edit")}
                            onClick={(e) => {
                              e.stopPropagation();
                              onQuickAction("edit", booking.id);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <span className={`text-xs ${colors.text}`}>
                      {t("scheduling.operations.timeline.available")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
