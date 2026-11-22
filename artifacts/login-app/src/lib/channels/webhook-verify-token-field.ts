/**
 * Helpers for webhook verify-token UI.
 * Mirrors server-side whatsapp_is_unchanged_secret / whatsapp_mask_secret shapes
 * so the client never treats a masked placeholder as a copyable plaintext token.
 */

export function isMaskedSecretDisplayValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === "********") return true;
  if (/^\*+$/.test(trimmed)) return true;
  if (/^\*+[A-Za-z0-9]{1,8}$/.test(trimmed)) return true;
  return false;
}

/** True only when the field holds a real token safe to copy into Meta Dashboard. */
export function isCopyableWebhookVerifyToken(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && !isMaskedSecretDisplayValue(trimmed);
}

/**
 * When hydrating draft from public settings RPC, never put a mask into the input.
 * Empty draft + hasStoredToken means "keep existing secret on save".
 */
export function draftWebhookVerifyTokenFromSettings(storedDisplayValue: string): string {
  if (!storedDisplayValue.trim()) return "";
  if (isMaskedSecretDisplayValue(storedDisplayValue)) return "";
  return storedDisplayValue.trim();
}
