import type { SalesFollowUpChannel } from "./sales-follow-up.js";

/** Follow-up channel → existing omnichannel channel_key used by outbound dispatch. */
export const SALES_FOLLOW_UP_OMNI_CHANNEL_KEY: Record<SalesFollowUpChannel, string> = {
  whatsapp: "whatsapp",
  web_chat: "web_chat",
  email: "email",
  instagram: "instagram",
  facebook: "messenger",
  sms: "sms",
};
