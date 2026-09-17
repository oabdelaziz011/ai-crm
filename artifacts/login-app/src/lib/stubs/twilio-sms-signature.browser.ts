/**
 * Browser stub for server-only Twilio signature helpers.
 * Real HMAC verification uses node:crypto and must not load in Vite client graphs.
 */

function serverOnly(name: string): never {
  throw new Error(`${name} is server-only and unavailable in the browser.`);
}

export function buildTwilioSignaturePayload(
  _url: string,
  _params: Record<string, string>,
): string {
  return serverOnly("buildTwilioSignaturePayload");
}

export function computeTwilioRequestSignature(
  _authToken: string,
  _url: string,
  _params: Record<string, string>,
): string {
  return serverOnly("computeTwilioRequestSignature");
}

export function verifyTwilioRequestSignature(_input: {
  authToken: string;
  signatureHeader: string | undefined | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  return serverOnly("verifyTwilioRequestSignature");
}
