function readWebCrypto(): Crypto | undefined {
  if ("crypto" in globalThis) {
    const crypto = globalThis.crypto;
    if (crypto && typeof crypto.randomUUID === "function") {
      return crypto;
    }
  }
  return undefined;
}

export function generateWhatsAppVerifyToken(): string {
  const crypto = readWebCrypto();
  const suffix =
    crypto != null ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `wa-verify-${suffix}`;
}

export function readWhatsAppPhoneNumberId(configuration: Record<string, unknown>): string | null {
  const value = configuration.phoneNumberId;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readWhatsAppVerifyToken(configuration: Record<string, unknown>): string | null {
  const value = configuration.verifyToken;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
