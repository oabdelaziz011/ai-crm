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

export type MetaWebhookSignatureSecretCandidate = {
  source: string;
  secret: string;
};

export type MetaWebhookSignatureWithSecretsResult = {
  ok: boolean;
  matchedSource: string | null;
  sourcesTried: string[];
  headerPresent: boolean;
  headerStartsWithSha256: boolean;
};

/**
 * Try HMAC-SHA256 against an ordered list of trusted App Secrets (key rotation /
 * Meta app migration). Does not skip verification when any candidate is present.
 */
export async function verifyMetaWebhookSignatureWithSecrets(input: {
  signatureHeader?: string | null;
  rawBody: string;
  secrets: readonly MetaWebhookSignatureSecretCandidate[];
  requireSecret?: boolean;
}): Promise<MetaWebhookSignatureWithSecretsResult> {
  const header = input.signatureHeader?.trim() ?? "";
  const headerPresent = header.length > 0;
  const headerStartsWithSha256 = header.startsWith("sha256=");
  const sourcesTried = input.secrets.map((candidate) => candidate.source);

  if (input.secrets.length === 0) {
    return {
      ok: input.requireSecret ? false : true,
      matchedSource: null,
      sourcesTried,
      headerPresent,
      headerStartsWithSha256,
    };
  }

  for (const candidate of input.secrets) {
    const ok = await verifyMetaWebhookSignature({
      signatureHeader: input.signatureHeader,
      rawBody: input.rawBody,
      appSecret: candidate.secret,
      requireSecret: true,
    });
    if (ok) {
      return {
        ok: true,
        matchedSource: candidate.source,
        sourcesTried,
        headerPresent,
        headerStartsWithSha256,
      };
    }
  }

  return {
    ok: false,
    matchedSource: null,
    sourcesTried,
    headerPresent,
    headerStartsWithSha256,
  };
}

export function mapMetaDeliveryStatus(
  status: "sent" | "delivered" | "read" | "failed",
): "sent" | "delivered" | "read" | "failed" {
  return status;
}
