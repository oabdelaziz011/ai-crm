/**
 * Infer reply language from the customer's latest message.
 * Arabic script → Arabic; otherwise English (WhatsApp/Messenger default for mixed tenants).
 */
export function detectReplyLanguage(text: string | null | undefined): "Arabic" | "English" {
  const value = typeof text === "string" ? text : "";
  // Arabic letters (including presentation forms) — enough to catch Egyptian WhatsApp chat.
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(value)) {
    return "Arabic";
  }
  return "English";
}
