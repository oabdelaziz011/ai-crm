import { timingSafeEqualHex } from "./timing-safe-equal.js";

function getSubtleCrypto(): SubtleCrypto {
  const cryptoRef = globalThis.crypto;
  if (!cryptoRef?.subtle) {
    throw new Error("CRYPTO_SUBTLE_UNAVAILABLE");
  }
  return cryptoRef.subtle;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await getSubtleCrypto().importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await getSubtleCrypto().sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToHex(signature);
}

export async function verifyHmacSha256Hex(input: {
  secret: string;
  payload: string;
  expectedHex: string;
}): Promise<boolean> {
  const actual = await hmacSha256Hex(input.secret, input.payload);
  return timingSafeEqualHex(actual, input.expectedHex);
}
