/**
 * Company Brand Center signatures are structured fields under
 * companies.branding.email.signature (legacy string → name only).
 * Composer stores editable body separately; signature is appended for outbound / display.
 * Company template variables (e.g. {{company.name}}) are resolved at render time only.
 * Email logo is identity branding — never part of the editable body.
 * Outbound order: body → logo → signature → optional legal footer → quoted history.
 *
 * Gmail clips content after empty border-only separators ("...") — never emit those.
 */
import {
  EMAIL_SIGNATURE_MARKER,
  htmlToPlainText,
  plainTextToSafeHtml,
  sanitizeComposerHtml,
  appendHtmlSignatureOnce,
} from "@/lib/email-workspace/email-composer-rich-text";
import {
  hasEmailSignatureConfig,
  renderEmailSignatureHtml,
} from "@workspace/channel-platform";
import {
  resolveCompanyTemplateVariablesInText,
  type TrustedCompanyTemplateSource,
} from "@/lib/email-templates/email-template-company-context";

/** Resolve branding.email.signature (structured or legacy string) → safe HTML. */
export function resolveCompanySignatureHtml(
  signature: Parameters<typeof renderEmailSignatureHtml>[0],
): string {
  return renderEmailSignatureHtml(signature);
}

export function htmlToPlainSignature(html: string): string {
  return htmlToPlainText(html);
}

/** True when Brand Center has a non-empty managed company email signature. */
export function hasManagedCompanyEmailSignature(
  signature: Parameters<typeof hasEmailSignatureConfig>[0],
): boolean {
  if (signature && typeof signature === "object") {
    return hasEmailSignatureConfig(signature);
  }
  if (typeof signature === "string" && /<[a-z][\s\S]*>/i.test(signature)) {
    // Already-rendered HTML path (composer/outbound rebuild).
    return Boolean(htmlToPlainText(signature).trim());
  }
  return hasEmailSignatureConfig(signature);
}

export function appendSignatureOnce(body: string, signature: string): string {
  const sig = signature.trim();
  if (!sig) return body;
  if (body.includes(sig)) return body;
  if (!body.trim()) return `\n\n${sig}`;
  return `${body.trimEnd()}\n\n${sig}`;
}

/** AI rewrites the body only; re-attach company signature once if the model dropped it. */
export function applyAiBodyKeepingSignature(
  aiBody: string,
  signature: string,
): string {
  return appendSignatureOnce(aiBody.trim(), signature);
}

/**
 * AI returns plain text; convert to HTML for the rich composer while keeping
 * the editable body free of the company signature block (shown separately in UI).
 */
export function applyAiHtmlBody(aiBody: string): string {
  const text = String(aiBody ?? "").trim();
  if (!text) return "";
  if (/<[a-z][\s\S]*>/i.test(text)) return sanitizeComposerHtml(text);
  return plainTextToSafeHtml(text);
}

/** Render Brand Center signature HTML with trusted company variables (display/outbound only). */
export function renderCompanySignatureHtml(input: {
  signatureHtml: string;
  trustedCompany: TrustedCompanyTemplateSource;
}): string {
  const sanitized = sanitizeComposerHtml(input.signatureHtml);
  if (!sanitized.trim()) return "";
  return sanitizeComposerHtml(
    resolveCompanyTemplateVariablesInText(sanitized, input.trustedCompany),
  );
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Safe http(s) logo URL only — empty/invalid/localhost → no logo markup. */
export function sanitizeEmailLogoUrl(logoUrl: string | null | undefined): string | null {
  const raw = String(logoUrl ?? "").trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return null;
  if (/[\s<>"']/.test(raw)) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    // Outbound email clients cannot load loopback hosts — never emit them in MIME HTML.
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) {
      return null;
    }
  } catch {
    return null;
  }
  return raw;
}

/** Build a single identity logo block (not editable body content). */
export function buildEmailLogoHtml(logoUrl: string | null | undefined): string {
  const safe = sanitizeEmailLogoUrl(logoUrl);
  if (!safe) return "";
  // display:block + height:auto keeps vertical flow; avoid zero-height / hidden styles.
  return `<div data-email-identity-logo="1" style="margin:16px 0 8px 0;line-height:normal;font-size:14px;"><img src="${escapeHtmlAttr(safe)}" alt="" width="160" style="display:block;max-width:200px;height:auto;border:0;outline:none;text-decoration:none;" /></div>`;
}

/**
 * Normalize signature HTML into visible block content (never empty wrappers).
 * Plain text becomes paragraph(s); existing markup is kept after sanitize.
 */
export function normalizeOutboundSignatureInnerHtml(signatureHtml: string): string {
  const raw = String(signatureHtml ?? "").trim();
  if (!raw) return "";
  if (!/<[a-z][\s\S]*>/i.test(raw)) {
    return plainTextToSafeHtml(raw);
  }
  const sanitized = sanitizeComposerHtml(raw).trim();
  if (!sanitized) return "";
  // Ensure at least one block element so clients don't treat the sig as orphaned text.
  if (!/<(p|div|table|ul|ol)\b/i.test(sanitized)) {
    return `<p style="margin:0;">${sanitized}</p>`;
  }
  return sanitized;
}

/**
 * Single contentful signature wrapper — no empty border-top sibling (Gmail clip trigger).
 * Never wrap structured markup in a second table: Gmail hides nested/trailing
 * signature tables behind "..." and restyles the clipped block as one color.
 */
export function buildEmailSignatureBlockHtml(signatureHtml: string): string {
  const inner = normalizeOutboundSignatureInnerHtml(signatureHtml);
  if (!inner) return "";
  if (inner.includes(`${EMAIL_SIGNATURE_MARKER}=`)) return inner;
  if (/^\s*<(table|div)\b/i.test(inner)) {
    return inner.replace(/^(\s*)<(table|div)\b/i, `$1<$2 ${EMAIL_SIGNATURE_MARKER}="1"`);
  }
  return `<div ${EMAIL_SIGNATURE_MARKER}="1" style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">${inner}</div>`;
}

/**
 * Insert the identity logo once, immediately before the signature block when present,
 * otherwise after the body. Never prepends as a header.
 * Does not re-sanitize (composer sanitizer strips &lt;img&gt;).
 */
export function insertEmailLogoOnce(html: string, logoHtml: string): string {
  const logo = logoHtml.trim();
  if (!logo) return html;
  if (html.includes('data-email-identity-logo="1"')) return html;

  const signatureMarker = "data-valueor-email-signature";
  const sigIdx = html.indexOf(signatureMarker);
  if (sigIdx >= 0) {
    // Insert before the signature element that owns the marker.
    const openIdx = html.lastIndexOf("<", sigIdx);
    const insertAt = openIdx >= 0 ? openIdx : sigIdx;
    return `${html.slice(0, insertAt)}${logo}${html.slice(insertAt)}`;
  }
  return `${html}${logo}`;
}

/**
 * @deprecated Use insertEmailLogoOnce — logo must sit between body and signature, not as a header.
 * Kept as a named export so existing imports keep compiling; behavior matches insertEmailLogoOnce.
 */
export function prependEmailLogoOnce(html: string, logoHtml: string): string {
  return insertEmailLogoOnce(html, logoHtml);
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Optional legal/company disclaimer under the signature. */
export function buildEmailLegalFooterHtml(input: {
  enabled?: boolean;
  text?: string | null;
}): string {
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

export function appendEmailLegalFooterOnce(html: string, footerHtml: string): string {
  const footer = footerHtml.trim();
  if (!footer) return html;
  if (html.includes('data-email-legal-footer="1"')) return html;
  return `${html}${footer}`;
}

/**
 * Split composer HTML so logo+signature stay ABOVE quoted / forwarded history.
 * Prevents Gmail from collapsing the signature with quote/trimmed regions.
 */
export function splitHtmlAroundQuotedHistory(bodyHtml: string): {
  leading: string;
  quoted: string;
} {
  const html = String(bodyHtml ?? "");
  if (!html.trim()) return { leading: "", quoted: "" };

  const patterns: RegExp[] = [
    /<blockquote\b/i,
    /class=["'][^"']*\bgmail_quote\b/i,
    /class=["'][^"']*\bgmail_extra\b/i,
    /class=["'][^"']*\byahoo_quoted\b/i,
    /----------\s*Forwarded message\s*----------/i,
    /<p[^>]*>\s*----------\s*Forwarded message\s*----------/i,
    /On .+wrote:\s*</i,
  ];

  let cut = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.index != null && (cut < 0 || match.index < cut)) {
      cut = match.index;
    }
  }
  if (cut < 0) return { leading: html, quoted: "" };
  return { leading: html.slice(0, cut), quoted: html.slice(cut) };
}

function normalizeOutboundBodyHtml(bodyHtml: string): string {
  const trimmed = String(bodyHtml ?? "").trim();
  if (!trimmed) return "";
  // Already composed outbound (logo/signature markers) — do not re-sanitize or
  // attribute order / table wrappers churn and break idempotent rebuilds.
  if (
    trimmed.includes("data-valueor-email-signature") ||
    trimmed.includes('data-email-identity-logo="1"')
  ) {
    return trimmed;
  }
  if (!/<[a-z][\s\S]*>/i.test(trimmed)) return plainTextToSafeHtml(trimmed);
  return sanitizeComposerHtml(trimmed);
}

const OUTBOUND_MAIN_MARKER = "data-valueor-outbound-main";

/**
 * Keep body + logo + signature in one presentation cell so Gmail does not clip
 * the signature behind "..." (it treats a trailing sibling table/div after an
 * image as quoted/trimmed content).
 */
export function wrapVisibleOutboundMainHtml(html: string): string {
  const inner = String(html ?? "").trim();
  if (!inner) return "";
  if (inner.includes(`${OUTBOUND_MAIN_MARKER}=`)) return inner;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${OUTBOUND_MAIN_MARKER}="1" style="border-collapse:collapse;"><tr><td style="padding:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">${inner}</td></tr></table>`;
}

/**
 * Build sanitized outbound HTML = body → logo → signature → optional legal footer → quotes.
 * Body and signature are sanitized separately; logo is never run through the
 * composer sanitizer (which historically stripped img).
 *
 * Never emits an empty border-top-only separator (Gmail "..." clip trigger).
 */
export function buildComposerOutboundHtml(input: {
  bodyHtml: string;
  signatureHtml: string;
  logoUrl?: string | null;
  legalFooterEnabled?: boolean;
  legalFooterText?: string | null;
  trustedCompany?: TrustedCompanyTemplateSource | null;
}): string {
  const rawBody = input.trustedCompany
    ? resolveCompanyTemplateVariablesInText(input.bodyHtml, input.trustedCompany)
    : input.bodyHtml;
  // Split before sanitize so quote markers (blockquote / Forwarded message) survive.
  const { leading: rawLeading, quoted: rawQuoted } = splitHtmlAroundQuotedHistory(rawBody);
  const leading = normalizeOutboundBodyHtml(rawLeading);
  const quoted = normalizeOutboundBodyHtml(rawQuoted);

  const signature = input.trustedCompany
    ? renderCompanySignatureHtml({
        signatureHtml: input.signatureHtml,
        trustedCompany: input.trustedCompany,
      })
    : sanitizeComposerHtml(input.signatureHtml);

  const logoHtml = buildEmailLogoHtml(input.logoUrl);
  const signatureBlock =
    signature.trim() &&
    !leading.includes("data-valueor-email-signature") &&
    !(signature.trim() && leading.includes(signature.trim()))
      ? buildEmailSignatureBlockHtml(signature)
      : "";

  const brandingParts: string[] = [];
  if (logoHtml && !leading.includes('data-email-identity-logo="1"') && !quoted.includes('data-email-identity-logo="1"')) {
    brandingParts.push(logoHtml);
  }
  if (signatureBlock) brandingParts.push(signatureBlock);

  const legal = buildEmailLegalFooterHtml({
    enabled: input.legalFooterEnabled,
    text: input.legalFooterText,
  });

  const legalBlock =
    legal && ![leading, ...brandingParts, quoted].join("").includes('data-email-legal-footer="1"')
      ? legal
      : "";

  // Visible new content stays in one cell; quoted history stays outside so Gmail
  // can trim quotes without hiding the signature.
  const visible = wrapVisibleOutboundMainHtml(
    [leading, ...brandingParts, legalBlock].filter((part) => part.trim()).join(""),
  );
  return `${visible}${quoted}`;
}

/** Build plain-text outbound from HTML body + optional plain signature. */
export function buildComposerOutboundText(input: {
  bodyHtml: string;
  signatureHtml: string;
  logoUrl?: string | null;
  legalFooterEnabled?: boolean;
  legalFooterText?: string | null;
  trustedCompany?: TrustedCompanyTemplateSource | null;
}): string {
  const html = buildComposerOutboundHtml(input);
  return htmlToPlainText(html);
}

export { appendHtmlSignatureOnce };
