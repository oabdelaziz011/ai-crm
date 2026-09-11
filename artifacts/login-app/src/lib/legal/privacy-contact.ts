/** Default public privacy inbox (product domain). Overridable via Vite env. */
export const DEFAULT_PRIVACY_CONTACT_EMAIL = "privacy@valueor.org";

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

export function buildDataDeletionMailtoHref(email: string, subject: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}
