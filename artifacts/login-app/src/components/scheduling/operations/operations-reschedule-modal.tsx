import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAvailableBookingSlots } from "@/hooks/use-booking-domain";
import type { OperationsBookingView } from "@/lib/scheduling/operations/types";

type OperationsRescheduleModalProps = {
  open: boolean;
  booking: OperationsBookingView | null;
  companyId: string | null;
  onClose: () => void;
  onConfirm: (input: { date: string; slotStart: string }) => Promise<void>;
  loading?: boolean;
};

export function OperationsRescheduleModal({
  open,
  booking,
  companyId,
  onClose,
  onConfirm,
  loading,
}: OperationsRescheduleModalProps) {
  const { t } = useTranslation("common");
  const [date, setDate] = useState("");
  const [slotStart, setSlotStart] = useState("");

  useEffect(() => {
    if (booking && open) {
      setDate(booking.startAt.slice(0, 10));
      setSlotStart(booking.displayStart);
    }
  }, [booking, open]);

  const { data: slots, isLoading: slotsLoading } = useAvailableBookingSlots(
    companyId,
    booking?.resourceId ?? null,
    booking?.serviceId ?? null,
    date || null,
  );

  const handleConfirm = async () => {
    if (!date || !slotStart) return;
    await onConfirm({ date, slotStart });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("scheduling.operations.reschedule.title")}</DialogTitle>
          <DialogDescription>{t("scheduling.operations.reschedule.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("scheduling.operations.reschedule.date")}</Label>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSlotStart("");
              }}
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>{t("scheduling.operations.reschedule.availableSlots")}</Label>
            {slotsLoading ? (
              <p className="text-sm text-muted-foreground">{t("scheduling.operations.reschedule.loadingSlots")}</p>
            ) : (slots?.slots.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("scheduling.operations.reschedule.noSlots")}
              </p>
            ) : (
              <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto">
                {(slots?.slots ?? []).map((slot) => (
                  <Button
                    key={slot}
                    type="button"
                    size="sm"
                    variant={slotStart === slot ? "default" : "outline"}
                    onClick={() => setSlotStart(slot)}
                  >
                    {slot}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {booking ? (
            <p className="text-xs text-muted-foreground">
              {t("scheduling.operations.reschedule.preserveHint", {
                customer: booking.customer?.name ?? "—",
              })}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t("buttons.cancel")}
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={loading || !slotStart}>
            {t("scheduling.operations.reschedule.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
