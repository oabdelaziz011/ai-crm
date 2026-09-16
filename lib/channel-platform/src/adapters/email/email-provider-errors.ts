/**
 * Map low-level transport failures to safe user-facing error codes.
 * Never return passwords, tokens, or raw stack traces to clients.
 */

import {
  EMAIL_PROVIDER_ERROR_CODES,
  type EmailProviderErrorCode,
} from "./email-provider-contract.js";

export function mapEmailProviderError(error: unknown): {
  code: EmailProviderErrorCode;
  /** Safe short message for logs (no secrets). */
  logMessage: string;
} {
  const raw = error instanceof Error ? error.message : String(error ?? "unknown");
  const lower = raw.toLowerCase();

  // Strip anything that looks like a bearer/token/password fragment from logs.
  const logMessage = raw
    .replace(/(bearer\s+)[a-z0-9._\-]+/gi, "$1[redacted]")
    .replace(/(password|refresh_token|access_token|client_secret)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .slice(0, 240);

  if (
    lower.includes("invalid_grant") ||
    lower.includes("token expired") ||
    lower.includes("aadsts70008") ||
    lower.includes("needs_reauthorization") ||
    lower.includes("consent_required")
  ) {
    return { code: EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED, logMessage };
  }
  if (
    lower.includes("authentication failed") ||
    lower.includes("invalid credentials") ||
    lower.includes("535") ||
    lower.includes("auth") && lower.includes("fail")
  ) {
    return { code: EMAIL_PROVIDER_ERROR_CODES.AUTH_INVALID, logMessage };
  }
  if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("etimedout")) {
    return { code: EMAIL_PROVIDER_ERROR_CODES.CONNECT_FAILED, logMessage };
  }
  if (lower.includes("550") || lower.includes("553") || lower.includes("rejected")) {
    return { code: EMAIL_PROVIDER_ERROR_CODES.SERVER_REJECTED, logMessage };
  }
  if (lower.includes("send") || lower.includes("smtp")) {
    return { code: EMAIL_PROVIDER_ERROR_CODES.SEND_FAILED, logMessage };
  }
  return { code: EMAIL_PROVIDER_ERROR_CODES.CONNECT_FAILED, logMessage };
}
