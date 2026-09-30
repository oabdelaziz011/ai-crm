import { createHash, createHmac, randomBytes } from "node:crypto";

const VISITOR_TOKEN_PATTERN = /^wct_[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WIDGET_KEY_PATTERN = /^wcw_[0-9a-f]{48}$/;

/** Opaque 256-bit visitor token. Returned to the visitor once; only its SHA-256 is stored. */
export function generateVisitorToken(): string {
  return `wct_${randomBytes(32).toString("base64url")}`;
}

/** Matches internal.web_chat_visitor_token_hash (SHA-256 hex over UTF-8). */
export function hashVisitorToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isWellFormedVisitorToken(token: unknown): token is string {
  return typeof token === "string" && VISITOR_TOKEN_PATTERN.test(token);
}

export function generateVisitorId(): string {
  return `wv_${randomBytes(16).toString("hex")}`;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isWellFormedWidgetKey(value: unknown): value is string {
  return typeof value === "string" && WIDGET_KEY_PATTERN.test(value);
}

/** Keyed hash so stored IP / user-agent hashes cannot be reversed by enumeration. */
export function hashVisitorFingerprint(value: string | null | undefined, secret: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return createHmac("sha256", secret).update(trimmed, "utf8").digest("hex");
}
