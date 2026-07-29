import { verifyHmacSha256Hex } from "@workspace/platform-crypto";

export function verifyMetaWebhookChallenge(input: {
  mode?: string;
  verifyToken?: string;
  challenge?: string;
  expectedVerifyToken: string;
}): string | null {
  if (input.mode !== "subscribe") return null;
  if (!input.challenge || input.verifyToken !== input.expectedVerifyToken) return null;
  return input.challenge;
}

export async function verifyMetaWebhookSignature(input: {
  signatureHeader?: string | null;
  rawBody: string;
  appSecret?: string | null;
  requireSecret?: boolean;
}): Promise<boolean> {
  const secret = input.appSecret?.trim();
  if (!secret) {
    return input.requireSecret ? false : true;
  }

  const header = input.signatureHeader?.trim();
  if (!header?.startsWith("sha256=")) {
    return false;
  }

  const expectedHex = header.slice("sha256=".length);
  return verifyHmacSha256Hex({
    secret,
    payload: input.rawBody,
    expectedHex,
  });
}

export function mapMetaDeliveryStatus(
  status: "sent" | "delivered" | "read" | "failed",
): "sent" | "delivered" | "read" | "failed" {
  return status;
}
