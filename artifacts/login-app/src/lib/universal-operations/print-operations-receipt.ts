import type { TFunction } from "i18next";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import i18n from "@/i18n";
import { supabase } from "@/lib/supabase";
import { loadCompanyIdentity } from "@/lib/company-workspace/services/company-identity-service";
import { translateOperationsVisitTypeLabel } from "@/lib/i18n/operations-queue-labels";
import {
  buildOperationsReceiptHtml,
  THERMAL_PAGE_WIDTH_MM,
  type ReceiptPaymentLine,
} from "@/lib/universal-operations/operations-receipt-document";

export type { ReceiptPaymentLine };
export {
  buildOperationsReceiptHtml,
  groupPaymentsByMethod,
  paymentMethodLabel,
  THERMAL_CONTENT_WIDTH_MM,
  THERMAL_PAGE_WIDTH_MM,
  THERMAL_SIDE_MARGIN_MM,
} from "@/lib/universal-operations/operations-receipt-document";

export type OperationsReceiptModel = {
  dir: "rtl" | "ltr";
  accent: string;
  companyName: string;
  /** Invoice number. Separate from the booking confirmation. */
  receiptNo: string | null;
  /** scheduling_bookings.confirmation_number (BK-…). */
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

function textOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text || text === "—") return null;
  return text;
}

function safeAccent(color: string | null | undefined): string {
  const value = String(color ?? "").trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : "#0f766e";
}

function formatDateOnly(value: string | null, language: string): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Intl.DateTimeFormat(language.startsWith("ar") ? "ar-EG" : "en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(parsed));
}

function formatWhen(value: string | null, language: string): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Intl.DateTimeFormat(language.startsWith("ar") ? "ar-EG" : "en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

export async function loadOperationsReceiptModel(row: OperationsRow): Promise<OperationsReceiptModel> {
  const t = i18n.t.bind(i18n) as TFunction;
  const language = i18n.language || "ar";
  const identity = await loadCompanyIdentity(row.companyId).catch(() => null);
  const { data: companyRow } = await supabase
    .from("companies")
    .select("name")
    .eq("id", row.companyId)
    .maybeSingle();
  const companyName =
    textOrNull(companyRow?.name) ||
    textOrNull(identity?.name) ||
    textOrNull(identity?.legalName) ||
    "—";
  const { data: booking, error } = await supabase
    .from("scheduling_bookings")
    .select("id, confirmation_number, amount_cents, currency, discount_cents, tax_cents, visit_type, invoice_id, start_at")
    .eq("id", row.id)
    .eq("company_id", row.companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!booking) throw new Error("Booking not found");

  let receiptNo: string | null = null;
  let subtotalCents = Number(booking.amount_cents) || 0;
  let discountCents = Number(booking.discount_cents) || 0;
  let taxCents = Number(booking.tax_cents) || 0;
  let totalCents = Math.max(0, subtotalCents - discountCents + taxCents);
  let paidCents = 0;
  const payments: ReceiptPaymentLine[] = [];

  if (booking.invoice_id) {
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("invoice_number, subtotal_cents, discount_cents, tax_cents, total_cents, paid_cents")
      .eq("id", booking.invoice_id)
      .eq("company_id", row.companyId)
      .maybeSingle();
    if (!invoiceError && invoice) {
      receiptNo = textOrNull(invoice.invoice_number);
      if (Number(invoice.total_cents) > 0) {
        subtotalCents = Number(invoice.subtotal_cents) || subtotalCents;
        discountCents = Number(invoice.discount_cents) || 0;
        taxCents = Number(invoice.tax_cents) || 0;
        totalCents = Number(invoice.total_cents);
      }
      paidCents = Number(invoice.paid_cents) || 0;
    }
    const { data: paymentRows, error: paymentError } = await supabase
      .from("customer_payments")
      .select("amount_cents, currency, payment_method, status")
      .eq("invoice_id", booking.invoice_id)
      .eq("company_id", row.companyId)
      .order("created_at", { ascending: true });
    if (!paymentError) {
      for (const payment of paymentRows ?? []) {
        const status = String(payment.status ?? "");
        if (status !== "completed" && status !== "paid") continue;
        payments.push({
          amountCents: Number(payment.amount_cents) || 0,
          currency: String(payment.currency || booking.currency || "USD"),
          method: String(payment.payment_method || "other"),
        });
      }
    }
    if (paidCents <= 0) {
      paidCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
    }
  }

  const currency = String(booking.currency || row.values.currency || "USD");
  return {
    dir: language.startsWith("ar") ? "rtl" : "ltr",
    accent: safeAccent(identity?.colors?.primary),
    companyName,
    receiptNo,
    bookingRef: textOrNull(booking.confirmation_number) || textOrNull(row.values.reference),
    issuedAt: formatDateOnly(new Date().toISOString(), language) ?? "",
    customer: textOrNull(row.values.customer) || "—",
    service: textOrNull(row.values.service) || "—",
    visitType: translateOperationsVisitTypeLabel(t, booking.visit_type || row.values.visit_type),
    appointment: formatWhen(booking.start_at ? String(booking.start_at) : null, language),
    currency,
    totalCents,
    paidCents,
    payments,
  };
}

/** Prints the thermal receipt inside the current page. No extra browser window. */
export function printReceiptFrame(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "receipt-print");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = `${THERMAL_PAGE_WIDTH_MM}mm`;
  iframe.style.height = "100vh";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);
  const frameDocument = iframe.contentDocument;
  const frameWindow = iframe.contentWindow;
  if (!frameDocument || !frameWindow) {
    iframe.remove();
    throw new Error("receipt_print_unavailable");
  }
  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
  frameWindow.focus();
  frameWindow.print();
  frameWindow.addEventListener("afterprint", () => iframe.remove(), { once: true });
  window.setTimeout(() => iframe.remove(), 60_000);
}

export function openOperationsReceiptWindow(html: string): boolean {
  printReceiptFrame(html);
  return true;
}

export async function printOperationsReceipt(row: OperationsRow): Promise<void> {
  const model = await loadOperationsReceiptModel(row);
  const html = buildOperationsReceiptHtml(model, i18n.t.bind(i18n) as TFunction);
  printReceiptFrame(html);
}
