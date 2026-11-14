import { HttpError } from "../middleware/error-handler.js";

/**
 * Omnichannel outbound reply: accept either lifecycle or legacy AI reply code.
 * Mirrors Email Compose "any of" reply authorization (without channels.manage).
 */
export const OMNICHANNEL_REPLY_PERMISSIONS = [
  "conversation.reply",
  "ai.conversations.reply",
] as const;

export type OmnichannelReplyAuthContext = {
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export function assertOmnichannelReplyPermission(ctx: OmnichannelReplyAuthContext): void {
  if (ctx.isSuperAdmin) return;
  for (const code of OMNICHANNEL_REPLY_PERMISSIONS) {
    if (ctx.hasPermission(code)) return;
  }
  throw new HttpError(403, "conversation.reply permission is required.", "forbidden");
}
