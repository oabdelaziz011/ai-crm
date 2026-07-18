export function randomUUID(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef?.randomUUID) {
    return cryptoRef.randomUUID();
  }
  throw new Error("CRYPTO_RANDOM_UUID_UNAVAILABLE");
}
