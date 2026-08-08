import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OperationsRow } from "@workspace/universal-operations-engine";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatOperationsQueueMoney } from "@/lib/i18n/operations-queue-labels";

const PAYMENT_METHODS = ["cash", "card", "transfer", "wallet", "other"] as const;

export type CollectPaymentDialogValues = {
  customerId: string;
  bookingId: string;
  amountCents: number;
  currency: string;
  method: string;
  discountCents: number;
  taxCents: number;
  serviceDescription: string;
  servicePriceCents: number;
};

export function CollectPaymentDialog({
  open,
  row,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  row: OperationsRow | null;
  busy?: boolean;
  onConfirm: (values: CollectPaymentDialogValues) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("common");
  const servicePriceCents = Math.max(0, Number(row?.values.amount) || 0);
  const currency = String(row?.values.currency ?? "USD").toUpperCase();
  const serviceName = String(row?.values.service ?? "—");

  const [discountMajor, setDiscountMajor] = useState("0");
  const [taxMajor, setTaxMajor] = useState("0");
  const [method, setMethod] = useState<string>("cash");

  useEffect(() => {
    if (!open || !row) return;
    setDiscountMajor(String((Number(row.values.discount_cents) || 0) / 100));
    setTaxMajor(String((Number(row.values.tax_cents) || 0) / 100));
    setMethod("cash");
  }, [open, row]);

  const discountCents = Math.max(0, Math.round((Number(discountMajor) || 0) * 100));
  const taxCents = Math.max(0, Math.round((Number(taxMajor) || 0) * 100));
  const finalAmountCents = Math.max(0, servicePriceCents - discountCents + taxCents);

  const money = useMemo(
    () => ({
      price: formatOperationsQueueMoney(t, servicePriceCents, currency),
      discount: formatOperationsQueueMoney(t, discountCents, currency),
      tax: formatOperationsQueueMoney(t, taxCents, currency),
      final: formatOperationsQueueMoney(t, finalAmountCents, currency),
    }),
    [currency, discountCents, finalAmountCents, servicePriceCents, t, taxCents],
  );

  if (!row?.customerId) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("universalOperations.payment.collectTitle", { defaultValue: "Collect Payment" })}</DialogTitle>
          <DialogDescription>
            {t("universalOperations.payment.collectDescription", {
              defaultValue: "Confirm payment details for this booking.",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                {t("universalOperations.payment.service", { defaultValue: "Service" })}
              </span>
              <span className="font-medium">{serviceName}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span className="text-muted-foreground">
                {t("universalOperations.payment.price", { defaultValue: "Price" })}
              </span>
              <span className="tabular-nums">{money.price}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ops-pay-discount">
                {t("universalOperations.payment.discount", { defaultValue: "Discount" })}
              </Label>
              <Input
                id="ops-pay-discount"
                type="number"
                min={0}
                step="0.01"
                disabled={busy}
                value={discountMajor}
                onChange={(e) => setDiscountMajor(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ops-pay-tax">
                {t("universalOperations.payment.tax", { defaultValue: "Tax" })}
              </Label>
              <Input
                id="ops-pay-tax"
                type="number"
                min={0}
                step="0.01"
                disabled={busy}
                value={taxMajor}
                onChange={(e) => setTaxMajor(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
            <span className="font-medium">
              {t("universalOperations.payment.finalAmount", { defaultValue: "Final Amount" })}
            </span>
            <span className="font-semibold tabular-nums">{money.final}</span>
          </div>

          <div className="space-y-1.5">
            <Label>{t("universalOperations.payment.method", { defaultValue: "Payment Method" })}</Label>
            <Select value={method} onValueChange={setMethod} disabled={busy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {t(`universalOperations.payment.methods.${code}`, {
                      defaultValue: code.charAt(0).toUpperCase() + code.slice(1),
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {t("buttons.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button
            type="button"
            disabled={busy || finalAmountCents <= 0 || !method}
            onClick={() => {
              if (!row.customerId) return;
              onConfirm({
                customerId: row.customerId,
                bookingId: row.id,
                amountCents: finalAmountCents,
                currency,
                method,
                discountCents,
                taxCents,
                serviceDescription: serviceName,
                servicePriceCents,
              });
            }}
          >
            {busy
              ? t("universalOperations.payment.confirming", { defaultValue: "Confirming…" })
              : t("universalOperations.payment.confirm", { defaultValue: "Confirm Payment" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
