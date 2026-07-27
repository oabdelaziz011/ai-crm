const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /\+?\d[\d\s()-]{7,}\d/g;

export function redactPii(value: string): string {
  return value.replace(EMAIL_PATTERN, "[email]").replace(PHONE_PATTERN, "[phone]");
}

export function safeCommunicationLog(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
): void {
  const safeMeta = meta
    ? Object.fromEntries(
        Object.entries(meta).map(([k, v]) => [
          k,
          typeof v === "string" ? redactPii(v) : v,
        ]),
      )
    : undefined;

  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  fn(`[communication] ${message}`, safeMeta ?? "");
}
