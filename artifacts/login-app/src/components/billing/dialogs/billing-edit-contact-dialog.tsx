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
import { useUpsertBillingContact } from "@/hooks/billing/use-billing-edit";
import type { BillingContact } from "@/lib/billing/types";

type BillingEditContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  contact?: BillingContact | null;
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

export function BillingEditContactDialog({
  open,
  onOpenChange,
  companyId,
  contact,
  onSuccess,
  onError,
}: BillingEditContactDialogProps) {
  const { t } = useTranslation("common");
  const mutation = useUpsertBillingContact();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(contact?.name ?? "");
      setEmail(contact?.email ?? "");
      setPhone(contact?.phone ?? "");
      setFieldError(null);
    }
  }, [open, contact]);

  const handleSubmit = async () => {
    setFieldError(null);
    if (!name.trim()) {
      setFieldError(t("billing.edit.contactNameRequired"));
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldError(t("billing.edit.contactEmailInvalid"));
      return;
    }

    try {
      await mutation.mutateAsync({
        companyId,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : t("billing.edit.contactSaveFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("billing.edit.editContact")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">{t("billing.edit.contactName")}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">{t("billing.edit.contactEmail")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">{t("billing.edit.contactPhone")}</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            />
          </div>
          {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t("buttons.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? t("billing.common.loading") : t("buttons.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
