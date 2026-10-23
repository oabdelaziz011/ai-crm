import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banknote,
  CalendarDays,
  Check,
  Clock3,
  Printer,
  UserRound,
  WalletCards,
} from "lucide-react";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatOperationsQueueMoney } from "@/lib/i18n/operations-queue-labels";
import {
  buildOperationsReceiptHtml,
  groupPaymentsByMethod,
  loadOperationsReceiptModel,
  paymentMethodLabel,
  printReceiptFrame,
  type OperationsReceiptModel,
} from "@/lib/universal-operations/print-operations-receipt";

function methodLabel(t: (key: string) => string, method: string): string {
  return paymentMethodLabel(t as never, method);
}

export function ReceiptPreviewDialog({
  open,
  row,
  onClose,
}: {
  open: boolean;
  row: OperationsRow | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("common");
  const [model, setModel] = useState<OperationsReceiptModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !row) {
      setModel(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setModel(null);
    setError(null);
    void loadOperationsReceiptModel(row)
      .then((next) => {
        if (!cancelled) setModel(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : t("universalOperations.actions.toast.error"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, row, t]);

  const print = () => {
    if (!model) return;
    printReceiptFrame(buildOperationsReceiptHtml(model, t));
  };

  const balance = model ? Math.max(0, model.totalCents - model.paidCents) : 0;
  const paidFull = Boolean(model && model.totalCents > 0 && balance === 0 && model.paidCents > 0);
  const accent = model?.accent || "#0f766e";
  const methodLines = model ? groupPaymentsByMethod(model.payments) : [];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-0 bg-white p-5 sm:max-w-[460px] sm:rounded-3xl">
        <DialogTitle className="sr-only">{t("universalOperations.receipt.title")}</DialogTitle>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!model && !error ? <p className="py-8 text-center text-sm text-muted-foreground">{t("universalOperations.payment.confirming")}</p> : null}
        {model ? (
          <article className="ops-receipt-sheet mx-auto w-[80mm] max-w-full text-slate-900" dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}>
            <h2 className="text-center text-xl font-extrabold" style={{ color: accent }}>{model.companyName}</h2>
            <div className="text-center">
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-teal-700">
                <Check className="size-3.5" />
                {paidFull ? t("universalOperations.receipt.paidFull") : t("universalOperations.receipt.paidPartial")}
              </span>
              <p className="mt-3 text-lg font-extrabold text-teal-950">{t("universalOperations.receipt.title")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("universalOperations.receipt.subtitle")}</p>
            </div>
            <section className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              <ReceiptLine label={t("universalOperations.receipt.booking")} value={model.bookingRef || "—"} />
              <ReceiptLine label={t("universalOperations.receipt.number")} value={model.receiptNo || "—"} />
              <ReceiptLine icon={CalendarDays} label={t("universalOperations.receipt.issuedAt")} value={model.issuedAt} />
              <ReceiptLine icon={UserRound} label={t("universalOperations.receipt.customer")} value={model.customer} />
              <ReceiptLine icon={WalletCards} label={t("universalOperations.receipt.service")} value={model.service} />
              <ReceiptLine icon={CalendarDays} label={t("universalOperations.receipt.visitType")} value={model.visitType} />
              <ReceiptLine icon={Clock3} label={t("universalOperations.receipt.appointment")} value={model.appointment} />
            </section>
            <section className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              <div className="bg-emerald-50 px-3 py-2 text-sm font-bold text-teal-700">{t("universalOperations.receipt.paymentDetails")}</div>
              <ReceiptLine icon={Banknote} label={t("universalOperations.receipt.total")} value={formatOperationsQueueMoney(t, model.totalCents, model.currency)} />
              {methodLines.map((payment) => (
                <ReceiptLine
                  key={payment.method}
                  icon={Banknote}
                  label={methodLabel(t, payment.method)}
                  value={formatOperationsQueueMoney(t, payment.amountCents, payment.currency || model.currency)}
                />
              ))}
              <ReceiptLine icon={Check} label={t("universalOperations.receipt.paid")} value={formatOperationsQueueMoney(t, model.paidCents, model.currency)} />
              <ReceiptLine icon={Clock3} label={t("universalOperations.receipt.balance")} value={formatOperationsQueueMoney(t, balance, model.currency)} />
            </section>
            <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-3 text-center text-teal-700">
              <p className="flex items-center justify-center gap-1 font-bold"><Check className="size-4" />{t("universalOperations.receipt.thanks")}</p>
              <p className="mt-1 text-xs text-slate-500">{model.companyName}</p>
            </div>
          </article>
        ) : null}
        <div className="ops-receipt-toolbar mt-4 flex items-center justify-between gap-3">
          <Button type="button" variant="outline" className="rounded-xl px-6" onClick={onClose}>
            {t("buttons.cancel", { defaultValue: "إلغاء" })}
          </Button>
          <Button type="button" className="rounded-xl px-5 text-white" style={{ backgroundColor: accent }} disabled={!model} onClick={print}>
            <Printer className="size-4" />
            {t("universalOperations.actions.items.printReceipt")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptLine({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof UserRound;
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2 border-t border-slate-100 px-3 py-2 text-sm">
      <span className="flex min-w-0 items-center gap-1.5 text-slate-500">
        {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
        {label}
      </span>
      <span className="min-w-0 text-end font-semibold text-slate-800 [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}
