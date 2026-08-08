import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, History, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import type { OperationalEscalationRecord } from "@/lib/conversation-lifecycle";

export type EscalationSheetSubmit = {
  escalateTo: EscalationLevel;
  reason: string;
  priority: string;
  notes: string;
};

type EscalationSheetProps = {
  open: boolean;
  currentLevel?: EscalationLevel | null;
  escalationHistory?: OperationalEscalationRecord[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: EscalationSheetSubmit) => void;
  onReturn?: () => void;
  onCancel?: () => void;
};

export const EscalationSheet = memo(function EscalationSheet({
  open,
  currentLevel,
  escalationHistory = [],
  onOpenChange,
  onSubmit,
  onReturn,
  onCancel,
}: EscalationSheetProps) {
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-rose-400" />
            {t("omnichannel.escalation.dialogTitle")}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto py-4">
          {currentLevel ? (
            <div className="rounded-lg border border-rose-400/20 bg-rose-400/8 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t("omnichannel.escalation.escalateTo")}: </span>
              <span className="font-medium capitalize">{currentLevel.replace(/_/g, " ")}</span>
            </div>
          ) : null}

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

          {escalationHistory.length > 0 ? (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <History className="size-3.5" />
                History
              </Label>
              <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border p-2 text-xs">
                {escalationHistory.map((record) => (
                  <li key={record.id} className="text-muted-foreground">
                    <span className="font-medium text-foreground">{record.level}</span>
                    {" · "}
                    {record.reason}
                    {" · "}
                    {new Date(record.escalatedAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {onReturn ? (
            <Button variant="outline" size="sm" onClick={onReturn}>
              <RotateCcw className="size-3.5" />
              {t("omnichannel.actions.returnConversation")}
            </Button>
          ) : null}
          {onCancel ? (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <XCircle className="size-3.5" />
              {t("omnichannel.actions.cancelEscalation")}
            </Button>
          ) : null}
          <Button className="ms-auto" onClick={handleSubmit}>
            {t("omnichannel.actions.escalate")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
});
