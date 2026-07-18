import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useRestoreBillingSubscription,
  useSuspendBillingSubscription,
} from "@/hooks/billing/use-billing-edit";

type BillingSubscriptionStatusDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  mode: "suspend" | "restore";
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

export function BillingSubscriptionStatusDialog({
  open,
  onOpenChange,
  companyId,
  mode,
  onSuccess,
  onError,
}: BillingSubscriptionStatusDialogProps) {
  const { t } = useTranslation("common");
  const suspendMutation = useSuspendBillingSubscription();
  const restoreMutation = useRestoreBillingSubscription();
  const [reason, setReason] = useState("");
  const isPending = suspendMutation.isPending || restoreMutation.isPending;

  useEffect(() => {
    if (open) setReason("");
  }, [open, mode]);

  const handleSubmit = async () => {
    try {
      if (mode === "suspend") {
        await suspendMutation.mutateAsync({ companyId, reason: reason.trim() || null });
      } else {
        await restoreMutation.mutateAsync({ companyId, reason: reason.trim() || null });
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : mode === "suspend"
            ? t("billing.edit.suspendFailed")
            : t("billing.edit.restoreFailed"),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "suspend" ? t("billing.edit.suspendTitle") : t("billing.edit.restoreTitle")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {mode === "suspend" ? t("billing.edit.suspendDescription") : t("billing.edit.restoreDescription")}
        </p>
        <div>
          <label className="text-sm text-muted-foreground">{t("billing.edit.reasonOptional")}</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t("buttons.cancel")}
          </Button>
          <Button
            variant={mode === "suspend" ? "destructive" : "default"}
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending
              ? t("billing.common.loading")
              : mode === "suspend"
                ? t("billing.edit.suspendConfirm")
                : t("billing.edit.restoreConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
