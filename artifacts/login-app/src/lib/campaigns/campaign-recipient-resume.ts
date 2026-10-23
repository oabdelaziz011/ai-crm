/**
 * Whether a failed campaign recipient may be enqueued again.
 * A stored provider id means the provider already accepted the message.
 * WhatsApp without an id is not proof of rejection: the provider may have
 * accepted the send and the id may never have been saved.
 */
export function shouldResumeFailedCampaignRecipient(recipient: {
  channel: string;
  status: string;
  provider_message_id?: string | null;
}): boolean {
  if (recipient.status !== "failed") return false;
  if (recipient.provider_message_id?.trim()) return false;
  if (recipient.channel === "whatsapp") return false;
  return true;
}
