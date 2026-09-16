/**
 * Read / safely render persisted email HTML (outbound or inbound).
 * Composer body sanitizer intentionally strips &lt;img&gt;; message HTML must keep
 * the identity logo between body and signature.
 */
import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import { sanitizeEmailMessageHtml } from "@/lib/company-workspace/brand-center/sanitize-email-html";

/** Thread/composer HTML — no prose color overrides so signature colors match outbound MIME. */
export const EMAIL_HTML_DOCUMENT_CLASSNAME =
  "max-w-none break-words [&_img]:my-2 [&_img]:max-h-16 [&_img]:max-w-[12rem] [&_a]:no-underline";

/** Prefer sanitized HTML, then original, from message metadata. */
export function readConversationEmailHtml(
  message: Pick<ConversationMessageRecord, "metadata">,
): string | null {
  const meta = message.metadata;
  if (!meta || typeof meta !== "object") return null;
  const sanitized = meta.htmlSanitized;
  if (typeof sanitized === "string" && sanitized.trim()) return sanitized.trim();
  const original = meta.htmlOriginal;
  if (typeof original === "string" && original.trim()) return original.trim();
  return null;
}

/** HTML safe for Email Workspace thread display (allows logo img). */
export function renderConversationEmailHtml(html: string): string {
  return sanitizeEmailMessageHtml(html);
}

export function conversationEmailHtmlContainsIdentityLogo(html: string): boolean {
  return /data-email-identity-logo\s*=\s*["']?1["']?/i.test(html) && /<img\b/i.test(html);
}
