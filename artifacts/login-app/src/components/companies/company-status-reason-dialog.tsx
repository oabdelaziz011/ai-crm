import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trimRequiredReason } from "@/lib/companies/company-access-state";

export type CompanyStatusReasonMode = "suspend" | "reject";

type CompanyStatusReasonDialogProps = {
  open: boolean;
  mode: CompanyStatusReasonMode;
  companyName: string;
  pending?: boolean;
  errorMessage?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
};

export function CompanyStatusReasonDialog({
  open,
  mode,
  companyName,
  pending = false,
  errorMessage = null,
  onOpenChange,
  onConfirm,
}: CompanyStatusReasonDialogProps) {
  const { t } = useTranslation("common");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const wasOpen = useRef(false);
  const valid = Boolean(trimRequiredReason(reason));

  useEffect(() => {
    if (open && !wasOpen.current) {
      setReason("");
      setTouched(false);
    }
    wasOpen.current = open;
  }, [open, mode]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "suspend"
              ? t("companies.lifecycle.suspendTitle")
              : t("companies.lifecycle.rejectTitle")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {mode === "suspend"
            ? t("companies.lifecycle.suspendMessage", { name: companyName })
            : t("companies.lifecycle.rejectMessage", { name: companyName })}
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="company-status-reason">
            {mode === "suspend"
              ? t("companies.lifecycle.suspendReason")
              : t("companies.lifecycle.rejectReason")}
          </Label>
          <Textarea
            id="company-status-reason"
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={t("companies.lifecycle.reasonPlaceholder")}
          />
          {touched && !valid ? (
            <p className="text-xs text-destructive">{t("companies.lifecycle.reasonRequired")}</p>
          ) : null}
          {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("buttons.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending || !valid}
            onClick={() => {
              const next = trimRequiredReason(reason);
              if (!next) {
                setTouched(true);
                return;
              }
              onConfirm(next);
            }}
          >
            {mode === "suspend"
              ? t("companies.lifecycle.suspendConfirm")
              : t("companies.lifecycle.rejectConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
