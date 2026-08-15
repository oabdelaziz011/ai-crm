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
  useMarkSubscriptionPastDue,
  useRecordSubscriptionRenewalFailure,
} from "@/hooks/billing/use-billing-lifecycle";

export type BillingLifecycleActionMode = "past_due" | "renewal_failure";

type BillingLifecycleActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  mode: BillingLifecycleActionMode;
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

export function BillingLifecycleActionDialog({
  open,
  onOpenChange,
  companyId,
  mode,
  onSuccess,
  onError,
}: BillingLifecycleActionDialogProps) {
  const { t } = useTranslation("common");
  const pastDueMutation = useMarkSubscriptionPastDue();
  const renewalFailureMutation = useRecordSubscriptionRenewalFailure();
  const [reason, setReason] = useState("");
  const isPending = pastDueMutation.isPending || renewalFailureMutation.isPending;

  useEffect(() => {
    if (open) setReason("");
  }, [open, mode]);

  const handleSubmit = async () => {
    try {
      if (mode === "past_due") {
        await pastDueMutation.mutateAsync({ companyId, reason: reason.trim() || null });
      } else {
        await renewalFailureMutation.mutateAsync({ companyId, reason: reason.trim() || null });
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      const fallback =
        mode === "past_due"
          ? t("billing.edit.markPastDueFailed", "Could not mark subscription past due.")
          : t(
              "billing.edit.recordRenewalFailureFailed",
              "Could not record renewal failure / start grace.",
            );
      onError?.(error instanceof Error ? error.message : fallback);
    }
  };

  const title =
    mode === "past_due"
      ? t("billing.edit.markPastDueTitle", "Mark subscription past due")
      : t("billing.edit.recordRenewalFailureTitle", "Start grace / record renewal failure");

  const description =
    mode === "past_due"
      ? t(
          "billing.edit.markPastDueDescription",
          "This changes the subscription lifecycle state to past due. It does NOT collect payment and does NOT perform renewal.",
        )
      : t(
          "billing.edit.recordRenewalFailureDescription",
          "This records a failed/unpaid renewal lifecycle event and may start a grace period. It does NOT collect payment and does NOT perform a paid renewal.",
        );

  const confirmLabel =
    mode === "past_due"
      ? t("billing.edit.markPastDueConfirm", "Mark past due")
      : t("billing.edit.recordRenewalFailureConfirm", "Record renewal failure");

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
          <Button variant="destructive" onClick={() => void handleSubmit()} disabled={isPending}>
            {isPending ? t("billing.common.loading") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
