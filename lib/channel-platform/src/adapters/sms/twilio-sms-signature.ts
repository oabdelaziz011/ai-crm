import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio webhook signature validation (X-Twilio-Signature).
 * Spec: HMAC-SHA1 of (url + sorted POST params concatenated as key+value), Base64.
 * @see https://www.twilio.com/docs/usage/security#validating-requests
 */
export function buildTwilioSignaturePayload(
  url: string,
  params: Record<string, string>,
): string {
  const keys = Object.keys(params).sort();
  let payload = url;
  for (const key of keys) {
    payload += key + (params[key] ?? "");
  }
  return payload;
}

export function computeTwilioRequestSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const payload = buildTwilioSignaturePayload(url, params);
  return createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

export function verifyTwilioRequestSignature(input: {
  authToken: string;
  signatureHeader: string | undefined | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  const expected = computeTwilioRequestSignature(input.authToken, input.url, input.params);
  const provided = String(input.signatureHeader ?? "").trim();
  if (!provided || !expected) return false;
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(provided, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Flatten Express/urlencoded body into string params for signature validation. */
export function flattenTwilioFormParams(body: unknown): Record<string, string> {
  const params: Record<string, string> = {};
  if (!body || typeof body !== "object") return params;
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      params[key] = String(value[0] ?? "");
    } else {
      params[key] = String(value);
    }
  }
  return params;
}

/**
 * Canonical public webhook URL for signature validation.
 * Prefer configured public base (tunnel / production); never invent localhost secrets.
 */
export function resolveTwilioWebhookValidationUrl(input: {
  publicBaseUrl: string | undefined | null;
  requestProtocol?: string;
  requestHost?: string;
  originalUrl: string;
}): string {
  const configured = String(input.publicBaseUrl ?? "")
    .trim()
    .replace(/\/$/, "");
  if (configured) {
    const path = input.originalUrl.startsWith("/")
      ? input.originalUrl
      : `/${input.originalUrl}`;
    // originalUrl may already include /api/webhooks/sms…
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    return `${configured}${path.split("?")[0]}`;
  }

  const proto = String(input.requestProtocol ?? "https").replace(":", "");
  const host = String(input.requestHost ?? "").trim();
  if (!host) {
    throw new Error("Twilio webhook validation URL cannot be resolved (missing public base / host).");
  }
  const path = input.originalUrl.split("?")[0] || "/api/webhooks/sms";
  return `${proto}://${host}${path.startsWith("/") ? path : `/${path}`}`;
}
