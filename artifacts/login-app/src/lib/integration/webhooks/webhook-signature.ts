import { hmacSha256Hex, verifyHmacSha256Hex, sha256Hex } from "@workspace/platform-crypto";

export async function computeWebhookSignature(secret: string, payload: string, timestamp: string): Promise<string> {
  return hmacSha256Hex(secret, `${timestamp}.${payload}`);
}

export async function validateWebhookSignature(input: {
  secret: string;
  payload: string;
  timestamp: string;
  signature: string;
  maxAgeSeconds?: number;
}): Promise<boolean> {
  const maxAge = input.maxAgeSeconds ?? 300;
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return false;
  const age = Math.abs(Date.now() / 1000 - ts);
  if (age > maxAge) return false;

  const sig = input.signature.replace(/^sha256=/, "");
  return verifyHmacSha256Hex({
    secret: input.secret,
    payload: `${input.timestamp}.${input.payload}`,
    expectedHex: sig,
  });
}

export function hashSecret(secret: string): string {
  return sha256Hex(secret);
}

export function generateApiKeySecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `vor_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `whsec_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function generateClientSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `voc_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
