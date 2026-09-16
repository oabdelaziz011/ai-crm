/**
 * Minimal BODY → LOGO → SIGNATURE HTML for acknowledgement outbound.
 * Mirrors login-app buildComposerOutboundHtml order without importing the app.
 */

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttr(value: string): string {
  return escapeHtmlText(value).replace(/'/g, "&#39;");
}

function sanitizeEmailLogoUrl(logoUrl: string | null | undefined): string | null {
  const raw = String(logoUrl ?? "").trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return null;
  if (/[\s<>"']/.test(raw)) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) {
      return null;
    }
  } catch {
    return null;
  }
  return raw;
}

function buildEmailLogoHtml(logoUrl: string | null | undefined): string {
  const safe = sanitizeEmailLogoUrl(logoUrl);
  if (!safe) return "";
  return `<div data-email-identity-logo="1" style="margin:16px 0 8px 0;line-height:normal;font-size:14px;"><img src="${escapeHtmlAttr(safe)}" alt="" width="160" style="display:block;max-width:200px;height:auto;border:0;outline:none;text-decoration:none;" /></div>`;
}

function plainTextToSafeHtml(text: string): string {
  const escaped = escapeHtmlText(text).replace(/\r\n|\r|\n/g, "<br/>");
  return `<p style="margin:0;">${escaped}</p>`;
}

function normalizeSignatureInner(signatureHtml: string): string {
  const raw = String(signatureHtml ?? "").trim();
  if (!raw) return "";
  if (!/<[a-z][\s\S]*>/i.test(raw)) return plainTextToSafeHtml(raw);
  // Trust Brand Center HTML already sanitized on save; strip scripts only.
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "");
}

function buildSignatureBlock(signatureHtml: string): string {
  const inner = normalizeSignatureInner(signatureHtml);
  if (!inner) return "";
  if (inner.includes("data-valueor-email-signature=")) return inner;
  if (/^\s*<(table|div)\b/i.test(inner)) {
    return inner.replace(/^(\s*)<(table|div)\b/i, `$1<$2 data-valueor-email-signature="1"`);
  }
  return `<div data-valueor-email-signature="1" style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">${inner}</div>`;
}

function wrapVisibleOutboundMainHtml(html: string): string {
  const inner = String(html ?? "").trim();
  if (!inner) return "";
  if (inner.includes("data-valueor-outbound-main=")) return inner;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" data-valueor-outbound-main="1" style="border-collapse:collapse;"><tr><td style="padding:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">${inner}</td></tr></table>`;
}

function buildLegalFooterHtml(input: { enabled?: boolean; text?: string | null }): string {
  if (!input.enabled) return "";
  const text = String(input.text ?? "").trim();
  if (!text) return "";
  const paragraphs = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 4px 0;">${escapeHtmlText(line)}</p>`)
    .join("");
  return `<div data-email-legal-footer="1" style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;line-height:1.45;color:#6b7280;">${paragraphs}</div>`;
}

export function buildAcknowledgementOutboundHtml(input: {
  bodyText: string;
  signatureHtml?: string | null;
  logoUrl?: string | null;
  legalFooterEnabled?: boolean;
  legalFooterText?: string | null;
}): string {
  const body = plainTextToSafeHtml(String(input.bodyText ?? "").trim() || " ");
  const logo = buildEmailLogoHtml(input.logoUrl);
  const signature = buildSignatureBlock(String(input.signatureHtml ?? ""));
  const legal = buildLegalFooterHtml({
    enabled: input.legalFooterEnabled,
    text: input.legalFooterText,
  });
  return wrapVisibleOutboundMainHtml(
    [body, logo, signature, legal].filter((part) => part.trim()).join(""),
  );
}

export function acknowledgementHtmlToPlainText(html: string): string {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
