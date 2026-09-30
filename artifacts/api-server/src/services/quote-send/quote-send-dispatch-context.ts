import type { ServiceContext } from "@workspace/channel-platform";

export const QUOTE_SEND_PERMISSION = "quotes.send";

/**
 * Channel-platform permissions delegated for the duration of an authorized quote send.
 * quotes.send is the product permission for sending quotes; the channel pipeline still
 * enforces company-channel ownership, commercial access, WhatsApp quota and delivery logging.
 */
export const QUOTE_SEND_DELEGATED_PERMISSIONS: ReadonlySet<string> = new Set([
  "channel.platform.dispatch",
  "ai.conversations.reply",
]);

/** Only valid after quotes.send was verified server-side for base.userId in base.companyId. */
export function createQuoteSendDispatchContext(base: ServiceContext): ServiceContext {
  return {
    userId: base.userId,
    companyId: base.companyId,
    isSuperAdmin: base.isSuperAdmin,
    hasPermission: (code: string) => base.hasPermission(code) || QUOTE_SEND_DELEGATED_PERMISSIONS.has(code),
  };
}
