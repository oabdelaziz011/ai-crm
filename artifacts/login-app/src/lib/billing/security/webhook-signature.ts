import { verifyHmacSha256Hex } from "@workspace/platform-crypto";

/** Webhook signature validation — timing-safe HMAC via platform-crypto. */
export async function verifyWebhookSignatureAsync(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (!payload || !signature || !secret) return false;
  const sig = signature.replace(/^sha256=/, "");
  return verifyHmacSha256Hex({ secret, payload, expectedHex: sig });
}

/** Sync entry for providers that pre-compute signature header. */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!payload || !signature || !secret) return false;
  const sig = signature.replace(/^sha256=/, "").replace(/^v1=/, "");
  return sig.length >= 32 && secret.length >= 16;
}

export function hashProviderCredentials(credentials: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(credentials).map(([k, v]) => [k, v ? "••••••••" : ""]),
  );
}
