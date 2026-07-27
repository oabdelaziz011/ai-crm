import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  OPERATIONS_CANCELLATION_REASONS,
  type OperationsCancellationReason,
} from "@/lib/scheduling/operations/types";

type OperationsCancelModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (input: { reason: OperationsCancellationReason; notes: string }) => Promise<void>;
  loading?: boolean;
};

export function OperationsCancelModal({
  open,
  onClose,
  onConfirm,
  loading,
}: OperationsCancelModalProps) {
  const { t } = useTranslation("common");
  const [reason, setReason] = useState<OperationsCancellationReason>("customer_request");
  const [notes, setNotes] = useState("");

  const handleConfirm = async () => {
    await onConfirm({ reason, notes });
    setNotes("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("scheduling.operations.cancel.title")}</DialogTitle>
          <DialogDescription>{t("scheduling.operations.cancel.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("scheduling.operations.cancel.reason")}</Label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as OperationsCancellationReason)}
              className="w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            >
              {OPERATIONS_CANCELLATION_REASONS.map((item) => (
                <option key={item} value={item}>
                  {t(`scheduling.operations.cancel.reasons.${item}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("scheduling.operations.cancel.notes")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("scheduling.operations.cancel.notesPlaceholder")}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t("buttons.cancel")}
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={loading}>
            {t("scheduling.operations.cancel.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
