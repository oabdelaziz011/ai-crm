import { Pencil, Phone, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { OperationsTimelineSlot } from "@/lib/scheduling/operations/types";
import { OPERATIONS_SLOT_COLORS } from "@/lib/scheduling/operations/utilities";

type OperationsTimelineProps = {
  slots: OperationsTimelineSlot[];
  onSelectBooking: (bookingId: string) => void;
  onQuickAction?: (action: "call" | "whatsapp" | "edit", bookingId: string) => void;
};

export function OperationsTimeline({
  slots,
  onSelectBooking,
  onQuickAction,
}: OperationsTimelineProps) {
  const { t } = useTranslation("common");

  if (slots.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-background/30 p-8 text-center text-sm text-muted-foreground">
        {t("scheduling.operations.timeline.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {slots.map((slot) => {
        const colors = OPERATIONS_SLOT_COLORS[slot.kind];
        const booking = slot.booking;

        return (
          <div
            key={slot.id}
            className={`group rounded-xl border p-3 transition-colors ${colors.bg} ${colors.border} ${
              booking ? "cursor-pointer hover:brightness-110" : ""
            }`}
            onClick={() => booking && onSelectBooking(booking.id)}
            onKeyDown={(e) => {
              if (booking && (e.key === "Enter" || e.key === " ")) {
                onSelectBooking(booking.id);
              }
            }}
            role={booking ? "button" : undefined}
            tabIndex={booking ? 0 : undefined}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="w-24 shrink-0 font-mono text-sm">
                  {slot.startTime} – {slot.endTime}
                </div>
                {booking ? (
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{booking.customer?.name ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">{booking.service?.name}</span>
                      {slot.resourceName ? (
                        <span className="text-xs text-muted-foreground">· {slot.resourceName}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      <span className={`rounded-full border px-2 py-0.5 ${colors.text} ${colors.border}`}>
                        {t(`scheduling.operations.status.${booking.status}`)}
                      </span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-muted-foreground">
                        {t(`scheduling.operations.payment.${booking.paymentStatus}`)}
                      </span>
                      <span className="text-muted-foreground">
                        {booking.durationMinutes} {t("scheduling.operations.minutes")}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className={`text-sm ${colors.text}`}>
                    {t("scheduling.operations.timeline.available")}
                  </span>
                )}
              </div>

              {booking && onQuickAction ? (
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickAction("call", booking.id);
                    }}
                  >
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickAction("whatsapp", booking.id);
                    }}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickAction("edit", booking.id);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
