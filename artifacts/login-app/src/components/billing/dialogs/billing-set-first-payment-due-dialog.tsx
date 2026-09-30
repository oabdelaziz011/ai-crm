import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { COMPANY_SUBSCRIPTIONS_KEY } from "@/hooks/billing/use-company-subscriptions";
import { supabase } from "@/lib/supabase";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName?: string | null;
  currentDueAt?: string | null;
};

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Super-admin only: set the first / next subscription payment due clock.
 * Drives tenant payment notices (days remaining) without inventing a new status system.
 */
export function BillingSetFirstPaymentDueDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
  currentDueAt,
}: Props) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dueLocal, setDueLocal] = useState(() => toDatetimeLocalValue(currentDueAt));
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setDueLocal(toDatetimeLocalValue(currentDueAt));
    setNote("");
  }, [open, currentDueAt]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!dueLocal.trim()) throw new Error("due_at_required");
      const dueAt = new Date(dueLocal);
      if (Number.isNaN(dueAt.getTime())) throw new Error("due_at_invalid");
      const { data, error } = await supabase.rpc("set_company_first_payment_due_v1", {
        p_company_id: companyId,
        p_due_at: dueAt.toISOString(),
        p_note: note.trim() || null,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, unknown>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COMPANY_SUBSCRIPTIONS_KEY });
      qc.invalidateQueries({ queryKey: [...COMPANY_SUBSCRIPTIONS_KEY, companyId] });
      qc.invalidateQueries({ queryKey: ["billing", "subscription-events"] });
      toast({
        title: t("billing.edit.firstPaymentDueSuccess", {
          defaultValue: "Payment due date saved",
        }),
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: t("billing.edit.firstPaymentDueFailed", {
          defaultValue: "Could not save payment due date",
        }),
        description: error.message,
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("billing.edit.firstPaymentDueTitle", {
              defaultValue: "Set first payment due date",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("billing.edit.firstPaymentDueDescription", {
              defaultValue:
                "Choose when this company’s subscription payment is due. Admins will see a countdown highlight before the date and can pay from Plan & billing.",
              name: companyName ?? "",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="first-payment-due">
              {t("billing.edit.firstPaymentDueLabel", { defaultValue: "Due date & time" })}
            </Label>
            <Input
              id="first-payment-due"
              type="datetime-local"
              value={dueLocal}
              onChange={(event) => setDueLocal(event.target.value)}
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="first-payment-note">
              {t("billing.edit.firstPaymentDueNote", { defaultValue: "Internal note (optional)" })}
            </Label>
            <Input
              id="first-payment-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={200}
              placeholder={t("billing.edit.firstPaymentDueNotePlaceholder", {
                defaultValue: "e.g. Agreed during onboarding call",
              })}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending || !dueLocal.trim()}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? t("common.saving", { defaultValue: "Saving…" })
              : t("billing.edit.firstPaymentDueConfirm", { defaultValue: "Save due date" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
