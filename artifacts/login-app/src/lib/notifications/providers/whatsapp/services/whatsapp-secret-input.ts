/**
 * Mirrors public.whatsapp_is_unchanged_secret / whatsapp_mask_secret semantics.
 * Public settings return masked secrets (e.g. ****************Kh9Q). Those must never
 * be written back as plaintext — empty string tells the upsert RPC to keep the
 * existing encrypted value.
 */
export function isUnchangedWhatsAppSecret(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return true;
  if (trimmed === "********") return true;
  // Mask from whatsapp_mask_secret: one-or-more '*' + optional short hint (1–8 chars).
  if (/^\*+[A-Za-z0-9]{0,8}$/.test(trimmed)) return true;
  return false;
}

/** Empty string = preserve existing encrypted secret in upsert_company_whatsapp_settings. */
export function normalizeWhatsAppSecretForUpsert(value: string | null | undefined): string {
  if (isUnchangedWhatsAppSecret(value)) return "";
  return (value ?? "").trim();
}

export function whatsappSecretInputMeta(value: string | null | undefined): {
  present: boolean;
  length: number;
  isUnchangedMask: boolean;
  prefix: string | null;
} {
  const trimmed = (value ?? "").trim();
  const isUnchangedMask = isUnchangedWhatsAppSecret(trimmed);
  return {
    present: Boolean(trimmed),
    length: trimmed.length,
    isUnchangedMask,
    prefix: !trimmed || isUnchangedMask ? null : trimmed.slice(0, 12),
  };
}
