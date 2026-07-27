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
import type { BookingConflictDetail } from "@/lib/scheduling/operations/conflicts";

export type DragRescheduleTarget = {
  bookingId: string;
  date: string;
  slotStart: string;
  slotEnd: string;
  customerName: string;
  serviceName: string;
};

type OperationsDragRescheduleDialogProps = {
  open: boolean;
  target: DragRescheduleTarget | null;
  conflicts: BookingConflictDetail[];
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function OperationsDragRescheduleDialog({
  open,
  target,
  conflicts,
  loading,
  onClose,
  onConfirm,
}: OperationsDragRescheduleDialogProps) {
  const { t } = useTranslation("common");
  const hasConflicts = conflicts.length > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("scheduling.operations.dragReschedule.title")}</DialogTitle>
          <DialogDescription>{t("scheduling.operations.dragReschedule.description")}</DialogDescription>
        </DialogHeader>

        {target ? (
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">{t("scheduling.operations.queue.customer")}</dt>
              <dd className="font-medium">{target.customerName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("scheduling.operations.drawer.service")}</dt>
              <dd>{target.serviceName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("scheduling.operations.drawer.time")}</dt>
              <dd className="font-mono">
                {target.date} {target.slotStart} – {target.slotEnd}
              </dd>
            </div>
          </dl>
        ) : null}

        {hasConflicts ? (
          <ul className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {conflicts.map((conflict, index) => (
              <li key={`${conflict.category}-${index}`}>{t(conflict.messageKey)}</li>
            ))}
          </ul>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t("buttons.cancel")}
          </Button>
          <Button onClick={onConfirm} disabled={loading || hasConflicts || !target}>
            {t("scheduling.operations.dragReschedule.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
