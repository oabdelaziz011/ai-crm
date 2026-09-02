import { sha256Hex } from "@workspace/platform-crypto";

/** Safe token diagnostics — never includes plaintext secrets. */
export type WhatsAppTokenFingerprint = {
  present: boolean;
  length: number;
  prefix: string | null;
  /** First 12 hex chars of sha256(token); for cross-path comparison only. */
  sha256_12: string | null;
};

export function fingerprintWhatsAppAccessToken(
  token: string | null | undefined,
): WhatsAppTokenFingerprint {
  const trimmed = (token ?? "").trim();
  if (!trimmed) {
    return { present: false, length: 0, prefix: null, sha256_12: null };
  }
  return {
    present: true,
    length: trimmed.length,
    prefix: trimmed.slice(0, 12),
    sha256_12: sha256Hex(trimmed).slice(0, 12),
  };
}
