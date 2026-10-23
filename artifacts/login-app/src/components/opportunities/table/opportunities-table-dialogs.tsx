import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { validateLostReason } from "./opportunities-table-row-actions";

export function OpportunityLostReasonDialog({
  open,
  onOpenChange,
  opportunityName,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityName: string;
  isPending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation("common");
  const [reason, setReason] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setReason("");
      setErrorKey(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("opportunities.table.lostDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("opportunities.table.lostDialog.description", { name: opportunityName })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="opportunity-lost-reason">
            {t("opportunities.table.lostDialog.reasonLabel")}
          </label>
          <Textarea
            id="opportunity-lost-reason"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (errorKey) setErrorKey(null);
            }}
            rows={3}
            disabled={isPending}
            aria-invalid={Boolean(errorKey)}
            aria-describedby={errorKey ? "opportunity-lost-reason-error" : undefined}
            placeholder={t("opportunities.table.lostDialog.reasonPlaceholder")}
          />
          {errorKey ? (
            <p id="opportunity-lost-reason-error" className="text-sm text-destructive" role="alert">
              {t(errorKey)}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {t("buttons.cancel")}
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={() => {
              const validationError = validateLostReason(reason);
              if (validationError) {
                setErrorKey(validationError);
                return;
              }
              onConfirm(reason.trim());
            }}
          >
            {t("opportunities.table.lostDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
