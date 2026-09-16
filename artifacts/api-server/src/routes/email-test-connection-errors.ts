import { HttpError } from "../middleware/error-handler.js";

export function sanitizeEmailTestErrorMessage(message: string): string {
  return message
    .replace(/\bbearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/pass(?:word)?\s*[=:]\s*\S+/gi, "password=[redacted]")
    .replace(/\bauth(?:orization)?\s*[=:]\s*\S+/gi, "auth=[redacted]")
    .replace(/\bapi[_-]?key\s*[=:]\s*\S+/gi, "api_key=[redacted]")
    .trim();
}

/**
 * Map test-send failures to the existing HttpError convention.
 * SMTP/auth/config problems must not become a generic unexpected 500.
 */
export function mapEmailTestConnectionError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;

  const raw = error instanceof Error ? error.message : String(error);
  const message = sanitizeEmailTestErrorMessage(raw);
  const lower = message.toLowerCase();

  if (/disabled|not configured/i.test(message)) {
    return new HttpError(400, message, "email_not_configured");
  }
  if (/not entitled|quota exceeded|commercial access/i.test(message)) {
    return new HttpError(403, message, "FEATURE_NOT_ENTITLED");
  }
  if (/invalid login|authentication failed|\beauth\b|535[- ]/i.test(message)) {
    return new HttpError(502, message || "SMTP authentication failed.", "smtp_auth_failed");
  }
  if (
    /econnrefused|etimedout|esocket|econnection|greeting never received|smtp.*unavailable|connect (e|refused)/i.test(
      lower,
    )
  ) {
    return new HttpError(502, message || "SMTP server is unavailable.", "smtp_unavailable");
  }
  if (/recipient|rcpt to|invalid address|550[- ]|551[- ]|553[- ]/i.test(message)) {
    return new HttpError(400, message || "Recipient was rejected.", "invalid_recipient");
  }
  if (/smtp|nodemailer|sendmail|ehlo|starttls/i.test(lower)) {
    return new HttpError(502, message || "SMTP send failed.", "smtp_send_failed");
  }

  return new HttpError(500, "An unexpected error occurred.", "internal_error");
}
