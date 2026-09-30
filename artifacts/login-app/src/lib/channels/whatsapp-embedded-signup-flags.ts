function envFlagTrue(value: unknown): boolean {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/**
 * Browser-side gate for Embedded Signup UI. Default false.
 * Server still enforces WHATSAPP_EMBEDDED_SIGNUP_ENABLED.
 */
export function isWhatsAppEmbeddedSignupUiEnabled(): boolean {
  return envFlagTrue(import.meta.env.VITE_WHATSAPP_EMBEDDED_SIGNUP_ENABLED);
}

/**
 * Coexistence extras plumbing only. Default false.
 * Does not generate QR codes — Meta owns that UI.
 */
export function isWhatsAppCoexistenceUiEnabled(): boolean {
  return envFlagTrue(import.meta.env.VITE_WHATSAPP_COEXISTENCE_ENABLED);
}
