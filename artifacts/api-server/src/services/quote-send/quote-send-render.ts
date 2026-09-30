/**
 * Pure quote renderers for platform sending (Email Workspace HTML/text, WhatsApp text).
 * Only fields that exist on quotes / quote_line_items / companies are rendered —
 * validity is shown only when quotes.valid_until is set.
 */

export type QuoteSendLanguage = "en" | "ar";

export type QuoteRenderLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  isOptional: boolean;
};

export type QuoteRenderInput = {
  language: QuoteSendLanguage;
  company: {
    name: string;
    logoUrl: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  quote: {
    quoteNumber: string;
    title: string;
    currency: string;
    /** ISO timestamp — quote date (created_at). */
    issuedAt: string;
    /** YYYY-MM-DD or null. */
    validUntil: string | null;
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    shippingTotal: number;
    grandTotal: number;
    notes: string;
  };
  customerName: string;
  lines: QuoteRenderLine[];
};

const COPY = {
  en: {
    quotation: "Quotation",
    quoteNumber: "Quote number",
    date: "Date",
    preparedFor: "Prepared for",
    validUntil: "Valid until",
    product: "Item",
    qty: "Qty",
    unit: "Unit price",
    total: "Total",
    subtotal: "Subtotal",
    discount: "Discount",
    tax: "Tax",
    shipping: "Shipping",
    grandTotal: "Total",
    optional: "Optional",
    notes: "Notes",
    greeting: (name: string) => (name ? `Dear ${name},` : "Hello,"),
    intro: (company: string, number: string) =>
      `Please find below quotation ${number}${company ? ` from ${company}` : ""}.`,
    cta: "To accept this quotation or ask any questions, simply reply to this message.",
    subject: (number: string, company: string) =>
      `Quotation ${number}${company ? ` — ${company}` : ""}`,
    moreItems: (count: number) => `+${count} more item(s)`,
    contact: "Contact",
  },
  ar: {
    quotation: "عرض سعر",
    quoteNumber: "رقم العرض",
    date: "التاريخ",
    preparedFor: "مُعدّ لـ",
    validUntil: "صالح حتى",
    product: "البند",
    qty: "الكمية",
    unit: "سعر الوحدة",
    total: "الإجمالي",
    subtotal: "المجموع الفرعي",
    discount: "الخصم",
    tax: "الضريبة",
    shipping: "الشحن",
    grandTotal: "الإجمالي النهائي",
    optional: "اختياري",
    notes: "ملاحظات",
    greeting: (name: string) => (name ? `عزيزي/عزيزتي ${name}،` : "مرحبًا،"),
    intro: (company: string, number: string) =>
      `نرفق لكم عرض السعر رقم ${number}${company ? ` من ${company}` : ""}.`,
    cta: "لقبول عرض السعر أو لأي استفسار، يرجى الرد على هذه الرسالة.",
    subject: (number: string, company: string) =>
      `عرض سعر ${number}${company ? ` — ${company}` : ""}`,
    moreItems: (count: number) => `+${count} بند إضافي`,
    contact: "للتواصل",
  },
} as const;

/** WhatsApp free-form text limit (Cloud API) with headroom. */
const WHATSAPP_TEXT_LIMIT = 3900;
const WHATSAPP_MAX_LINES = 20;

export function normalizeQuoteSendLanguage(value: unknown): QuoteSendLanguage {
  return typeof value === "string" && value.trim().toLowerCase().startsWith("ar") ? "ar" : "en";
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatQuoteMoney(value: number, currency: string, language: QuoteSendLanguage): string {
  const amount = Number.isFinite(value) ? value : 0;
  const code = (currency || "USD").toUpperCase();
  const locale = language === "ar" ? "ar-EG-u-nu-latn" : "en-US";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

export function formatQuoteDate(iso: string | null, language: QuoteSendLanguage): string {
  if (!iso) return "";
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  const locale = language === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function isSafeHttpUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

type TotalsRow = { label: string; value: string; strong?: boolean };

function totalsRows(input: QuoteRenderInput): TotalsRow[] {
  const copy = COPY[input.language];
  const { quote, language } = input;
  const money = (value: number) => formatQuoteMoney(value, quote.currency, language);
  const rows: TotalsRow[] = [{ label: copy.subtotal, value: money(quote.subtotal) }];
  if (quote.discountTotal) rows.push({ label: copy.discount, value: `-${money(quote.discountTotal)}` });
  if (quote.taxTotal) rows.push({ label: copy.tax, value: money(quote.taxTotal) });
  if (quote.shippingTotal) rows.push({ label: copy.shipping, value: money(quote.shippingTotal) });
  rows.push({ label: copy.grandTotal, value: money(quote.grandTotal), strong: true });
  return rows;
}

export function buildQuoteEmailSubject(input: QuoteRenderInput): string {
  return COPY[input.language].subject(input.quote.quoteNumber, input.company.name);
}

export function renderQuoteEmailHtml(input: QuoteRenderInput): string {
  const copy = COPY[input.language];
  const rtl = input.language === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const start = rtl ? "right" : "left";
  const end = rtl ? "left" : "right";
  const { quote, company, language } = input;
  const money = (value: number) => escapeHtml(formatQuoteMoney(value, quote.currency, language));
  const cell = `padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;`;
  const head = `padding:10px 12px;background:#f3f4f6;font-size:12px;color:#4b5563;text-transform:uppercase;letter-spacing:.04em;`;

  const logo = isSafeHttpUrl(company.logoUrl)
    ? `<img src="${escapeHtml(company.logoUrl)}" alt="${escapeHtml(company.name)}" style="max-height:48px;max-width:180px;display:block;border:0;" />`
    : "";

  const lineRows = input.lines
    .map(
      (line) => `<tr>
        <td style="${cell}text-align:${start};">${escapeHtml(line.name)}${
          line.isOptional
            ? ` <span style="color:#6b7280;font-size:12px;">(${escapeHtml(copy.optional)})</span>`
            : ""
        }</td>
        <td style="${cell}text-align:center;">${escapeHtml(formatQuantity(line.quantity))}</td>
        <td style="${cell}text-align:${end};white-space:nowrap;">${money(line.unitPrice)}</td>
        <td style="${cell}text-align:${end};white-space:nowrap;font-weight:600;">${money(line.total)}</td>
      </tr>`,
    )
    .join("");

  const totals = totalsRows(input)
    .map(
      (row) => `<tr>
        <td style="padding:6px 12px;font-size:${row.strong ? "16px" : "14px"};color:${row.strong ? "#111827" : "#4b5563"};${row.strong ? "font-weight:700;border-top:1px solid #e5e7eb;" : ""}text-align:${start};">${escapeHtml(row.label)}</td>
        <td style="padding:6px 12px;font-size:${row.strong ? "16px" : "14px"};color:#111827;${row.strong ? "font-weight:700;border-top:1px solid #e5e7eb;" : ""}text-align:${end};white-space:nowrap;">${escapeHtml(row.value)}</td>
      </tr>`,
    )
    .join("");

  const meta: Array<[string, string]> = [
    [copy.quoteNumber, quote.quoteNumber],
    [copy.date, formatQuoteDate(quote.issuedAt, language)],
  ];
  if (input.customerName) meta.push([copy.preparedFor, input.customerName]);
  if (quote.validUntil) meta.push([copy.validUntil, formatQuoteDate(quote.validUntil, language)]);

  const metaRows = meta
    .map(
      ([label, value]) =>
        `<tr><td style="padding:3px 0;font-size:13px;color:#6b7280;text-align:${start};">${escapeHtml(label)}</td><td style="padding:3px 0;font-size:13px;color:#111827;font-weight:600;text-align:${end};">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const contactBits = [company.contactEmail, company.contactPhone].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
  const contact = contactBits.length
    ? `<p style="margin:4px 0 0;font-size:12px;color:#6b7280;">${escapeHtml(copy.contact)}: ${contactBits
        .map((value) => escapeHtml(value))
        .join(" · ")}</p>`
    : "";

  const notes = quote.notes.trim()
    ? `<div style="margin-top:20px;padding:12px 14px;background:#f9fafb;border-radius:8px;font-size:13px;color:#374151;"><div style="font-weight:600;margin-bottom:4px;">${escapeHtml(copy.notes)}</div>${escapeHtml(quote.notes.trim()).replace(/\n/g, "<br />")}</div>`
    : "";

  return `<!doctype html>
<html lang="${language}" dir="${dir}">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(buildQuoteEmailSubject(input))}</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Tahoma,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
  <tr><td style="padding:24px 28px;border-bottom:1px solid #e5e7eb;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="text-align:${start};vertical-align:middle;">${logo}<div style="font-size:16px;font-weight:700;color:#111827;margin-top:${logo ? "8px" : "0"};">${escapeHtml(company.name)}</div>${contact}</td>
      <td style="text-align:${end};vertical-align:top;"><div style="font-size:20px;font-weight:700;color:#111827;">${escapeHtml(copy.quotation)}</div><div style="font-size:13px;color:#6b7280;">${escapeHtml(quote.quoteNumber)}</div></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:24px 28px 8px;">
    <p style="margin:0 0 8px;font-size:15px;color:#111827;">${escapeHtml(copy.greeting(input.customerName))}</p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;">${escapeHtml(copy.intro(company.name, quote.quoteNumber))}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">${metaRows}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;overflow:hidden;">
      <tr>
        <th style="${head}text-align:${start};">${escapeHtml(copy.product)}</th>
        <th style="${head}text-align:center;">${escapeHtml(copy.qty)}</th>
        <th style="${head}text-align:${end};">${escapeHtml(copy.unit)}</th>
        <th style="${head}text-align:${end};">${escapeHtml(copy.total)}</th>
      </tr>
      ${lineRows}
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;margin-${start}:auto;min-width:260px;">${totals}</table>
    ${notes}
  </td></tr>
  <tr><td style="padding:16px 28px 28px;">
    <div style="padding:14px 16px;background:#eef2ff;border-radius:8px;font-size:14px;color:#1e1b4b;font-weight:600;">${escapeHtml(copy.cta)}</div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderQuoteEmailText(input: QuoteRenderInput): string {
  const copy = COPY[input.language];
  const { quote, language } = input;
  const money = (value: number) => formatQuoteMoney(value, quote.currency, language);
  const out: string[] = [];
  out.push(copy.greeting(input.customerName), "", copy.intro(input.company.name, quote.quoteNumber), "");
  out.push(`${copy.quoteNumber}: ${quote.quoteNumber}`);
  out.push(`${copy.date}: ${formatQuoteDate(quote.issuedAt, language)}`);
  if (input.customerName) out.push(`${copy.preparedFor}: ${input.customerName}`);
  if (quote.validUntil) out.push(`${copy.validUntil}: ${formatQuoteDate(quote.validUntil, language)}`);
  out.push("");
  for (const line of input.lines) {
    out.push(
      `- ${line.name}${line.isOptional ? ` (${copy.optional})` : ""}: ${formatQuantity(line.quantity)} × ${money(line.unitPrice)} = ${money(line.total)}`,
    );
  }
  out.push("");
  for (const row of totalsRows(input)) out.push(`${row.label}: ${row.value}`);
  if (quote.notes.trim()) out.push("", `${copy.notes}: ${quote.notes.trim()}`);
  out.push("", copy.cta, "", input.company.name);
  const contact = [input.company.contactEmail, input.company.contactPhone].filter(Boolean).join(" · ");
  if (contact) out.push(contact);
  return out.join("\n");
}

export function renderQuoteWhatsAppText(input: QuoteRenderInput): string {
  const copy = COPY[input.language];
  const { quote, language } = input;
  const money = (value: number) => formatQuoteMoney(value, quote.currency, language);
  const header: string[] = [];
  header.push(`*${input.company.name}* — ${copy.quotation} *${quote.quoteNumber}*`);
  header.push(`${copy.date}: ${formatQuoteDate(quote.issuedAt, language)}`);
  if (input.customerName) header.push(`${copy.preparedFor}: ${input.customerName}`);
  if (quote.validUntil) header.push(`${copy.validUntil}: ${formatQuoteDate(quote.validUntil, language)}`);

  const footer: string[] = [];
  for (const row of totalsRows(input)) footer.push(row.strong ? `*${row.label}: ${row.value}*` : `${row.label}: ${row.value}`);
  footer.push("", copy.cta);

  const lineTexts = input.lines.map(
    (line) =>
      `• ${line.name}${line.isOptional ? ` (${copy.optional})` : ""} — ${formatQuantity(line.quantity)} × ${money(line.unitPrice)} = ${money(line.total)}`,
  );

  const assemble = (count: number) => {
    const shown = lineTexts.slice(0, count);
    const hidden = lineTexts.length - shown.length;
    return [...header, "", ...shown, ...(hidden > 0 ? [copy.moreItems(hidden)] : []), "", ...footer].join("\n");
  };

  let count = Math.min(lineTexts.length, WHATSAPP_MAX_LINES);
  let text = assemble(count);
  while (text.length > WHATSAPP_TEXT_LIMIT && count > 0) {
    count -= 1;
    text = assemble(count);
  }
  return text.length > WHATSAPP_TEXT_LIMIT ? text.slice(0, WHATSAPP_TEXT_LIMIT) : text;
}
