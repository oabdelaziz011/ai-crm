import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatBillingCurrency } from "@/lib/billing/format";
import type { PaymentMethodOption } from "@/lib/billing/settings-runtime";

type BillingRecordPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  currency: string;
  loading?: boolean;
  paymentMethods: PaymentMethodOption[];
  selectedMethodCode: string;
  onMethodChange: (code: string) => void;
  activeMode: "sandbox" | "production";
  activeProviderCode: string;
  autoRenewal: boolean;
  configurationError?: string | null;
  onConfirm: () => void;
};

export function BillingRecordPaymentDialog({
  open,
  onOpenChange,
  amount,
  currency,
  loading = false,
  paymentMethods,
  selectedMethodCode,
  onMethodChange,
  activeMode,
  activeProviderCode,
  autoRenewal,
  configurationError = null,
  onConfirm,
}: BillingRecordPaymentDialogProps) {
  const { t } = useTranslation("common");
  const methodsUnavailable = Boolean(configurationError) || paymentMethods.length === 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("billing.payment.confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("billing.payment.confirmDescription", {
              amount: formatBillingCurrency(amount, currency),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          {configurationError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {configurationError}
            </p>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="payment-method" className="text-sm font-medium">
              {t("billing.payment.methodLabel")}
            </label>
            <select
              id="payment-method"
              disabled={loading || methodsUnavailable}
              value={selectedMethodCode}
              onChange={(e) => onMethodChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            >
              {methodsUnavailable ? (
                <option value="">{configurationError ?? t("billing.payment.noMethodsConfigured")}</option>
              ) : (
                paymentMethods.map((method) => (
                  <option key={method.code} value={method.code}>
                    {t(`billing.settings.paymentMethods.${method.code}`, {
                      defaultValue: method.display_name,
                    })}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground space-y-1">
            <p>
              {t("billing.payment.providerMode")}:{" "}
              <span className="text-foreground font-medium">
                {t(`billing.settings.providerMode.${activeMode}`)}
              </span>
            </p>
            <p>
              {t("billing.payment.providerCode")}:{" "}
              <span className="text-foreground font-medium">{activeProviderCode}</span>
            </p>
            <p>
              {t("billing.payment.autoRenewal")}:{" "}
              <span className="text-foreground font-medium">
                {autoRenewal ? t("billing.common.yes") : t("billing.common.no")}
              </span>
            </p>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t("buttons.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading || methodsUnavailable || !selectedMethodCode}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {loading ? t("billing.detail.recording") : t("billing.payment.confirmAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
