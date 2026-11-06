const UNSAFE_CUSTOMER_DETAIL =
  /provider_rate_limit|rate[_ ]limit|quota|openai|stack trace|\bat [\w$.]+\(|\/src\/|node_modules|sqlstate|\b23505\b|sk-|api[_ ]?key|bearer /i;

/** Customer copy may be shown. Provider text, stacks, and internal codes may not. */
export function isSafeCustomerDetail(detail: string): boolean {
  const text = detail.trim();
  if (!text || text.length > 240 || /[\r\n\t]/.test(text)) return false;
  if (UNSAFE_CUSTOMER_DETAIL.test(text)) return false;
  return true;
}

function readHumanMessage(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("humanMessage" in error)) return null;
  const value = (error as { humanMessage?: unknown }).humanMessage;
  return typeof value === "string" ? value.trim() : null;
}

/**
 * The floating assistant may show a domain human message.
 * Error.message is the developer text and is never shown.
 */
export function toCustomerFacingSendError(error: unknown): string {
  const human = readHumanMessage(error);
  if (human && isSafeCustomerDetail(human)) return human;
  return "channel_route_failed";
}

/** Shared by the floating panel and the workspace. Unsafe details become the generic failure. */
export function resolveFloatingSendErrorMessage(
  sendError: string | null | undefined,
  copy: {
    channelRouteFailed: string;
    runtimeFailed: (detail: string) => string;
  },
): string | null {
  if (!sendError) return null;
  if (sendError === "channel_route_failed" || !isSafeCustomerDetail(sendError)) {
    return copy.channelRouteFailed;
  }
  return copy.runtimeFailed(sendError);
}
