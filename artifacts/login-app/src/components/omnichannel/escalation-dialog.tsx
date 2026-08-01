import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ESCALATION_LEVELS,
  nextEscalationLevel,
  type EscalationLevel,
} from "@/lib/conversation-lifecycle/integration/escalation-ui-utils";

export type EscalationDialogSubmit = {
  escalateTo: EscalationLevel;
  reason: string;
  priority: string;
  notes: string;
};

type EscalationDialogProps = {
  open: boolean;
  currentLevel?: EscalationLevel | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: EscalationDialogSubmit) => void;
};

export const EscalationDialog = memo(function EscalationDialog({
  open,
  currentLevel,
  onOpenChange,
  onSubmit,
}: EscalationDialogProps) {
  const { t } = useTranslation("common");
  const [escalateTo, setEscalateTo] = useState<EscalationLevel>(nextEscalationLevel(currentLevel ?? null));
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState("high");
  const [notes, setNotes] = useState("");

  const handleSubmit = () => {
    onSubmit({
      escalateTo,
      reason: reason.trim() || t("omnichannel.escalation.defaultReason"),
      priority,
      notes: notes.trim(),
    });
    onOpenChange(false);
    setReason("");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("omnichannel.escalation.dialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t("omnichannel.escalation.escalateTo")}</Label>
            <Select value={escalateTo} onValueChange={(value) => setEscalateTo(value as EscalationLevel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESCALATION_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {t(`omnichannel.escalation.levels.${level}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("omnichannel.escalation.reason")}</Label>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>{t("omnichannel.escalation.priority")}</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["low", "normal", "high", "urgent"].map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("omnichannel.escalation.notes")}</Label>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("buttons.cancel")}
          </Button>
          <Button onClick={handleSubmit}>{t("omnichannel.actions.escalate")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
