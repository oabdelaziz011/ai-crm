import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { TICKET_PRIORITIES, type TicketPriority } from "@workspace/ticket-platform";
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

export function TicketChangePriorityDialog({
  open,
  currentPriority,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  currentPriority: TicketPriority;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (priority: TicketPriority) => void;
}) {
  const { t, i18n } = useTranslation("common");
  const [priority, setPriority] = useState<TicketPriority>(currentPriority);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) {
          noteNestedOverlayActivity();
          setPriority(currentPriority);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="rounded-2xl sm:max-w-md" dir={i18n.dir()}>
        <DialogHeader>
          <DialogTitle>{t("tickets.actions.changePriority")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{t("tickets.columns.priority")}</Label>
          <Select value={priority} onValueChange={(value) => setPriority(value as TicketPriority)}>
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_PRIORITIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(`tickets.priority.${item}`)}
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
            disabled={pending || priority === currentPriority}
            onClick={() => onConfirm(priority)}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {t("tickets.actions.applyPriority")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
