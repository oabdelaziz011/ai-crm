/**
 * Production-safe rich-text helpers for the Email Workspace composer.
 * Reuses Brand Center allowlist sanitizer — no heavy editor dependency.
 */
import { sanitizeEmailHtml } from "@/lib/company-workspace/brand-center/sanitize-email-html";

export const EMAIL_SIGNATURE_MARKER = "data-valueor-email-signature";

/**
 * @deprecated Empty border-only separators cause Gmail to clip following content
 * behind "...". Prefer a single contentful signature wrapper (see buildComposerOutboundHtml).
 * Kept as empty string so legacy concatenations do not re-introduce a clip boundary.
 */
export const EMAIL_SIGNATURE_SEPARATOR_HTML = "";

const UNRESOLVED_TOKEN_RE = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;

/** Escape plain text for safe HTML insertion. */
export function escapeHtmlText(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convert plain text (legacy drafts / templates) into sanitized paragraph HTML. */
export function plainTextToSafeHtml(text: string): string {
  const raw = String(text ?? "");
  if (!raw.trim()) return "";
  const html = raw
    .split(/\n/)
    .map((line) => (line.trim() ? `<p>${escapeHtmlText(line)}</p>` : "<p><br></p>"))
    .join("");
  return sanitizeEmailHtml(html);
}

/** HTML → plain text for MIME text/plain fallback and validation. */
export function htmlToPlainText(html: string): string {
  const raw = String(html ?? "");
  if (!raw.trim()) return "";
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(raw, "text/html");
    const text = doc.body.textContent ?? "";
    return text.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeComposerHtml(html: string): string {
  return sanitizeEmailHtml(String(html ?? ""));
}

/** Detect whether HTML already contains the company signature block. */
export function htmlContainsSignature(html: string, signatureHtml: string): boolean {
  const body = String(html ?? "");
  if (!body.trim()) return false;
  if (body.includes(`data-valueor-email-signature`)) return true;
  const sig = sanitizeComposerHtml(signatureHtml).trim();
  if (!sig) return false;
  return body.includes(sig);
}

/**
 * Append company signature HTML once as a single visible block (no empty HR separator).
 * Does nothing when signature is empty. Never invents user signatures.
 */
export function appendHtmlSignatureOnce(bodyHtml: string, signatureHtml: string): string {
  const sig = sanitizeComposerHtml(signatureHtml).trim();
  if (!sig) return sanitizeComposerHtml(bodyHtml);
  // Idempotent: if a signature marker/content is already present, do not rewrite HTML
  // (re-sanitizing would reorder attributes and break equality checks / client caching).
  if (htmlContainsSignature(bodyHtml, sig)) return String(bodyHtml ?? "");
  const body = sanitizeComposerHtml(bodyHtml);
  let block: string;
  if (sig.includes(EMAIL_SIGNATURE_MARKER)) {
    block = sig;
  } else if (/^\s*<(table|div)\b/i.test(sig)) {
    block = sig.replace(/^(\s*)<(table|div)\b/i, `$1<$2 ${EMAIL_SIGNATURE_MARKER}="1"`);
  } else {
    const sigInner = /<[a-z][\s\S]*>/i.test(sig) ? sig : `<p style="margin:0;">${sig}</p>`;
    block = `<div ${EMAIL_SIGNATURE_MARKER}="1" style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">${sigInner}</div>`;
  }
  if (!body.trim()) return block;
  return `${body}${block}`;
}

/** Build full outbound HTML (sanitized) from composer body + optional signature already in body. */
export function buildOutboundComposerHtml(bodyHtml: string): string {
  return sanitizeComposerHtml(bodyHtml);
}

/** Find unresolved {{token}} placeholders in subject/body (plain or HTML). */
export function findUnresolvedTemplateTokens(...parts: string[]): string[] {
  const found = new Set<string>();
  for (const part of parts) {
    const text = String(part ?? "");
    UNRESOLVED_TOKEN_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = UNRESOLVED_TOKEN_RE.exec(text)) !== null) {
      found.add(match[1]!.trim().toLowerCase());
    }
  }
  return [...found].sort();
}

/** True when content has meaningful body text (ignores empty tags / signature-only whitespace). */
export function composerHtmlHasContent(html: string): boolean {
  return htmlToPlainText(html).trim().length > 0;
}

/**
 * Insert plain/HTML template content into an existing rich body while keeping signature.
 * Template body is treated as plain text converted to safe HTML unless already HTML-ish.
 */
export function insertTemplateIntoRichBody(input: {
  currentHtml: string;
  templateBody: string;
  signatureHtml: string;
}): string {
  const templateLooksHtml = /<[a-z][\s\S]*>/i.test(input.templateBody);
  const templateHtml = templateLooksHtml
    ? sanitizeComposerHtml(input.templateBody)
    : plainTextToSafeHtml(input.templateBody);
  return appendHtmlSignatureOnce(templateHtml, input.signatureHtml);
}
