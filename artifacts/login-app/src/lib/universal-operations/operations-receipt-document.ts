import type { TFunction } from "i18next";
import { formatOperationsQueueMoney } from "@/lib/i18n/operations-queue-labels";

/**
 * Thermal roll settings. Change these after measuring the target printer.
 * 80mm is the roll width. 72mm is the printable content width (4mm each side).
 */
export const THERMAL_PAGE_WIDTH_MM = 80;
export const THERMAL_CONTENT_WIDTH_MM = 72;
export const THERMAL_SIDE_MARGIN_MM = (THERMAL_PAGE_WIDTH_MM - THERMAL_CONTENT_WIDTH_MM) / 2;

export type ReceiptPaymentLine = {
  amountCents: number;
  currency: string;
  method: string;
};

export type OperationsReceiptDocumentModel = {
  dir: "rtl" | "ltr";
  accent: string;
  companyName: string;
  receiptNo: string | null;
  bookingRef: string | null;
  issuedAt: string;
  customer: string;
  service: string;
  visitType: string;
  appointment: string | null;
  currency: string;
  totalCents: number;
  paidCents: number;
  payments: ReceiptPaymentLine[];
};

export function groupPaymentsByMethod(payments: ReceiptPaymentLine[]): ReceiptPaymentLine[] {
  const grouped = new Map<string, ReceiptPaymentLine>();
  for (const payment of payments) {
    const method = payment.method.trim().toLowerCase() || "other";
    const current = grouped.get(method);
    if (!current) {
      grouped.set(method, { ...payment, method, amountCents: payment.amountCents });
      continue;
    }
    current.amountCents += payment.amountCents;
  }
  return [...grouped.values()];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(t: TFunction, cents: number, currency: string): string {
  return formatOperationsQueueMoney(t, cents, currency);
}

export function paymentMethodLabel(t: TFunction, method: string): string {
  const token = method.trim().toLowerCase();
  const key =
    token === "bank_transfer" || token === "transfer"
      ? "transfer"
      : token === "card"
        ? "card"
        : token === "wallet"
          ? "wallet"
          : token === "cash"
            ? "cash"
            : "other";
  return t(`universalOperations.payment.methods.${key}`);
}

function line(label: string, value: string | null, required = false): string {
  const shown = value?.trim() ? value : required ? "—" : null;
  if (!shown) return "";
  return `<div class="line"><span>${escapeHtml(label)}</span><strong>${escapeHtml(shown)}</strong></div>`;
}

export function buildOperationsReceiptHtml(model: OperationsReceiptDocumentModel, t: TFunction): string {
  const balance = Math.max(0, model.totalCents - model.paidCents);
  const paidFull = model.totalCents > 0 && balance === 0 && model.paidCents > 0;
  const statusLabel = paidFull
    ? t("universalOperations.receipt.paidFull")
    : model.paidCents > 0
      ? t("universalOperations.receipt.paidPartial")
      : t("universalOperations.receipt.balance");
  const methodRows = groupPaymentsByMethod(model.payments)
    .map(
      (payment) =>
        line(paymentMethodLabel(t, payment.method), money(t, payment.amountCents, payment.currency || model.currency)),
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="${model.dir === "rtl" ? "ar" : "en"}" dir="${model.dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model.companyName)}</title>
  <style>
    /* 80mm auto is supported in Chromium. If the dialog still offers A4, choose the 80mm roll in the printer settings. */
    @page { size: ${THERMAL_PAGE_WIDTH_MM}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: ${THERMAL_PAGE_WIDTH_MM}mm; background: #fff; color: #134e4a; }
    body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; }
    .sheet {
      width: ${THERMAL_PAGE_WIDTH_MM}mm;
      margin: 0;
      padding: ${THERMAL_SIDE_MARGIN_MM}mm;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .inner { width: ${THERMAL_CONTENT_WIDTH_MM}mm; }
    .name { margin: 0; text-align: center; font-size: 16px; font-weight: 800; overflow-wrap: anywhere; }
    .badge, h1, .sub { text-align: center; }
    .badge { display: inline-block; margin-top: 6px; border-radius: 999px; background: #e7f6f1; color: #0f766e; padding: 2px 8px; font-size: 11px; font-weight: 700; }
    h1 { margin: 8px 0 2px; font-size: 16px; }
    .sub { margin: 0 0 8px; color: #4b5563; font-size: 11px; overflow-wrap: anywhere; }
    .card { border: 1px solid #d7e4e4; border-radius: 8px; overflow: hidden; }
    .line { display: flex; justify-content: space-between; gap: 2mm; padding: 2.5mm 2mm; border-top: 1px solid #e8f0f0; font-size: 12px; }
    .line span, .line strong { min-width: 0; overflow-wrap: anywhere; }
    .line span { color: #4b5563; }
    .line strong { text-align: start; }
    .payhead { background: #e7f6f1; color: #0f766e; font-weight: 700; font-size: 12px; padding: 2mm; }
    .thanks { margin-top: 3mm; border-radius: 8px; background: #e7f6f1; text-align: center; padding: 3mm 2mm; }
    .thanks strong, .thanks small { display: block; overflow-wrap: anywhere; }
    .thanks small { color: #4b5563; margin-top: 1mm; }
  </style>
</head>
<body>
  <article class="sheet">
    <div class="inner">
      <h2 class="name">${escapeHtml(model.companyName)}</h2>
      <div class="badge">${escapeHtml(statusLabel)}</div>
      <h1>${escapeHtml(t("universalOperations.receipt.title"))}</h1>
      <p class="sub">${escapeHtml(t("universalOperations.receipt.subtitle"))}</p>
      <section class="card">
        ${line(t("universalOperations.receipt.booking"), model.bookingRef, true)}
        ${line(t("universalOperations.receipt.number"), model.receiptNo, true)}
        ${line(t("universalOperations.receipt.issuedAt"), model.issuedAt)}
        ${line(t("universalOperations.receipt.customer"), model.customer)}
        ${line(t("universalOperations.receipt.service"), model.service)}
        ${line(t("universalOperations.receipt.visitType"), model.visitType)}
        ${line(t("universalOperations.receipt.appointment"), model.appointment)}
      </section>
      <section class="card" style="margin-top:3mm">
        <div class="payhead">${escapeHtml(t("universalOperations.receipt.paymentDetails"))}</div>
        ${line(t("universalOperations.receipt.total"), money(t, model.totalCents, model.currency))}
        ${methodRows}
        ${line(t("universalOperations.receipt.paid"), money(t, model.paidCents, model.currency))}
        ${line(t("universalOperations.receipt.balance"), money(t, balance, model.currency))}
      </section>
      <div class="thanks">
        <strong>${escapeHtml(t("universalOperations.receipt.thanks"))}</strong>
        <small>${escapeHtml(model.companyName)}</small>
      </div>
    </div>
  </article>
</body>
</html>`;
}
