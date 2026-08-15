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
  useCancelBillingSubscription,
  useRestoreBillingSubscription,
  useSuspendBillingSubscription,
} from "@/hooks/billing/use-billing-edit";

export type BillingSubscriptionStatusMode = "suspend" | "restore" | "cancel";

type BillingSubscriptionStatusDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  mode: BillingSubscriptionStatusMode;
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
  const cancelMutation = useCancelBillingSubscription();
  const [reason, setReason] = useState("");
  const isPending =
    suspendMutation.isPending || restoreMutation.isPending || cancelMutation.isPending;

  useEffect(() => {
    if (open) setReason("");
  }, [open, mode]);

  const handleSubmit = async () => {
    try {
      if (mode === "suspend") {
        await suspendMutation.mutateAsync({ companyId, reason: reason.trim() || null });
      } else if (mode === "restore") {
        await restoreMutation.mutateAsync({ companyId, reason: reason.trim() || null });
      } else {
        await cancelMutation.mutateAsync({
          companyId,
          reason: reason.trim() || null,
          atPeriodEnd: false,
        });
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      const fallback =
        mode === "suspend"
          ? t("billing.edit.suspendFailed")
          : mode === "restore"
            ? t("billing.edit.restoreFailed")
            : t("billing.edit.cancelFailed", "Could not cancel subscription");
      onError?.(error instanceof Error ? error.message : fallback);
    }
  };

  const title =
    mode === "suspend"
      ? t("billing.edit.suspendTitle")
      : mode === "restore"
        ? t("billing.edit.restoreTitle")
        : t("billing.edit.cancelTitle", "Cancel subscription");

  const description =
    mode === "suspend"
      ? t("billing.edit.suspendDescription")
      : mode === "restore"
        ? t("billing.edit.restoreDescription")
        : t(
            "billing.edit.cancelDescription",
            "Marks the subscription lifecycle as canceled. Does not delete company data or revoke grants by itself.",
          );

  const confirmLabel =
    mode === "suspend"
      ? t("billing.edit.suspendConfirm")
      : mode === "restore"
        ? t("billing.edit.restoreConfirm")
        : t("billing.edit.cancelConfirm", "Cancel subscription");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
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
            variant={mode === "restore" ? "default" : "destructive"}
            onClick={() => void handleSubmit()}
            disabled={isPending}
          >
            {isPending ? t("billing.common.loading") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
