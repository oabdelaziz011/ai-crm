import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { TICKET_STATUSES, type TicketStatus } from "@workspace/ticket-platform";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { noteNestedOverlayActivity } from "@/lib/ui/prevent-dialog-dismiss-for-nested-overlay";

export function TicketChangeStatusDialog({
  open,
  currentStatus,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  currentStatus: TicketStatus;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (status: TicketStatus) => void;
}) {
  const { t, i18n } = useTranslation("common");
  const [status, setStatus] = useState<TicketStatus>(currentStatus);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) {
          noteNestedOverlayActivity();
          setStatus(currentStatus);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="rounded-2xl sm:max-w-md" dir={i18n.dir()}>
        <DialogHeader>
          <DialogTitle>{t("tickets.actions.changeStatus")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{t("tickets.columns.status")}</Label>
          <Select value={status} onValueChange={(value) => setStatus(value as TicketStatus)}>
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_STATUSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(`tickets.status.${item}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t("tickets.cancel")}
          </Button>
          <Button
            type="button"
            className="rounded-xl gap-2"
            disabled={pending || status === currentStatus}
            onClick={() => onConfirm(status)}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {t("tickets.actions.applyStatus")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
