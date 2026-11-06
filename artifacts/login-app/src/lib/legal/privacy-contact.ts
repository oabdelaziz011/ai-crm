/** Public privacy inbox supplied for ValueOR. Overridable via Vite env. */
export const DEFAULT_PRIVACY_CONTACT_EMAIL = "valueor@admin.org";
export const DEFAULT_PRIVACY_CONTACT_PHONE = "+201011404109";

function readViteString(name: string): string {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    return String(env?.[name] ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * Public email for privacy and data-deletion requests.
 * Optional `VITE_PRIVACY_CONTACT_EMAIL` overrides the default; never reads secrets.
 */
export function getPrivacyContactEmail(): string {
  return readViteString("VITE_PRIVACY_CONTACT_EMAIL") || DEFAULT_PRIVACY_CONTACT_EMAIL;
}

export function getPrivacyContactPhone(): string {
  return readViteString("VITE_PRIVACY_CONTACT_PHONE") || DEFAULT_PRIVACY_CONTACT_PHONE;
}

export function buildDataDeletionMailtoHref(email: string, subject: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}
