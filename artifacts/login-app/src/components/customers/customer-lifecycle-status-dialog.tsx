/**
 * Dialog to deactivate / block a customer with a required reason,
 * or activate without a reason.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
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
import {
  lifecycleStatusErrorI18nKey,
  useSetCustomerLifecycleStatus,
} from "@/hooks/use-customers";
import {
  normalizeCustomerLifecycleStatus,
  validateLifecycleReason,
  type CustomerLifecycleStatus,
} from "@/lib/customers/customer-lifecycle";
import type { Customer } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

export type CustomerLifecycleDialogMode = "deactivate" | "block" | "activate";

type Props = {
  open: boolean;
  mode: CustomerLifecycleDialogMode | null;
  customer: Customer | null;
  onClose: () => void;
  onCompleted?: (customer: Customer) => void;
};

function nextStatusForMode(mode: CustomerLifecycleDialogMode): CustomerLifecycleStatus {
  if (mode === "deactivate") return "inactive";
  if (mode === "block") return "blocked";
  return "active";
}

export function CustomerLifecycleStatusDialog({
  open,
  mode,
  customer,
  onClose,
  onCompleted,
}: Props) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const mutation = useSetCustomerLifecycleStatus();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open, mode, customer?.id]);

  if (!mode || !customer) return null;

  const nextStatus = nextStatusForMode(mode);
  const requiresReason = nextStatus === "inactive" || nextStatus === "blocked";
  const currentStatus = normalizeCustomerLifecycleStatus(customer.status);

  const titleKey =
    mode === "deactivate"
      ? "forms.customer.lifecycle.deactivateTitle"
      : mode === "block"
        ? "forms.customer.lifecycle.blockTitle"
        : "forms.customer.lifecycle.activateTitle";

  const descriptionKey =
    mode === "deactivate"
      ? "forms.customer.lifecycle.deactivateDescription"
      : mode === "block"
        ? "forms.customer.lifecycle.blockDescription"
        : "forms.customer.lifecycle.activateDescription";

  const confirmKey =
    mode === "deactivate"
      ? "forms.customer.lifecycle.confirmDeactivate"
      : mode === "block"
        ? "forms.customer.lifecycle.confirmBlock"
        : "forms.customer.lifecycle.confirmActivate";

  const onSubmit = async () => {
    setError(null);
    const validated = validateLifecycleReason({ nextStatus, reason });
    if (!validated.ok) {
      setError(t("forms.customer.lifecycle.reasonRequired"));
      return;
    }

    try {
      const updated = await mutation.mutateAsync({
        customerId: customer.id,
        nextStatus,
        reason: validated.reason,
        expectedStatus: currentStatus,
      });
      toast({
        title: t("forms.customer.lifecycle.successTitle"),
        description: t("forms.customer.lifecycle.successDescription", {
          status: t(`dashboard.customers.list.status.${nextStatus}`),
        }),
      });
      onCompleted?.(updated);
      onClose();
    } catch (err) {
      const key = lifecycleStatusErrorI18nKey(err);
      setError(key ? t(key) : err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md bg-card text-foreground">
        <DialogHeader className="text-start">
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>{t(descriptionKey, { name: customer.name })}</DialogDescription>
        </DialogHeader>

        {requiresReason ? (
          <div className="space-y-2">
            <Label htmlFor="customer-lifecycle-reason">
              {mode === "block"
                ? t("forms.customer.lifecycle.blockReason")
                : t("forms.customer.lifecycle.deactivateReason")}
              {" *"}
            </Label>
            <textarea
              id="customer-lifecycle-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-border/70 bg-background/50 px-3 py-2.5 text-sm outline-none focus:border-primary/40"
              placeholder={t("forms.customer.lifecycle.reasonPlaceholder")}
              disabled={mutation.isPending}
            />
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            {t("buttons.cancel")}
          </Button>
          <Button
            type="button"
            variant={mode === "block" ? "destructive" : "default"}
            onClick={() => void onSubmit()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t(confirmKey)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
