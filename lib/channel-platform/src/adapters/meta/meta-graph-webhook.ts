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
  const requireSecret = Boolean(input.requireSecret);
  const secret = input.appSecret?.trim();
  if (!secret) {
    return requireSecret ? false : true;
  }

  const header = input.signatureHeader?.trim();
  if (!header?.startsWith("sha256=")) {
    // Local/dev (`requireSecret=false`): allow unsigned probes.
    // Production (`requireSecret=true`): reject missing/malformed signatures.
    return requireSecret ? false : true;
  }

  const expectedHex = header.slice("sha256=".length);
  const valid = await verifyHmacSha256Hex({
    secret,
    payload: input.rawBody,
    expectedHex,
  });
  if (valid) return true;

  // Local/dev: do not block Meta inbound when the stored App Secret is wrong/stale.
  // Production must keep rejecting HMAC mismatches.
  // Loud warning so the credential mismatch is still visible in logs.
  if (!requireSecret) {
    console.warn(
      "[META_WEBHOOK_SIGNATURE] HMAC mismatch accepted because requireSecret=false (development). " +
        "Update company WhatsApp App Secret to match Meta App → Settings → Basic → App secret for production-like verification.",
      {
        hasSignatureHeader: true,
        appSecretConfigured: true,
        appSecretLength: secret.length,
      },
    );
    return true;
  }

  return false;
}

export function mapMetaDeliveryStatus(
  status: "sent" | "delivered" | "read" | "failed",
): "sent" | "delivered" | "read" | "failed" {
  return status;
}
