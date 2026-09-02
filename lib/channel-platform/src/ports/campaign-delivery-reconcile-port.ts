/**
 * Optional port: reconcile marketing_campaign_recipients from WhatsApp
 * delivery webhooks / quoted replies without creating conversations.
 */
export type CampaignDeliveryWebhookStatus = "sent" | "delivered" | "read" | "failed";

export type CampaignDeliveryReconcilePort = {
  reconcileDeliveryStatus(input: {
    companyId: string;
    providerMessageId: string;
    status: CampaignDeliveryWebhookStatus;
    occurredAt?: string | null;
  }): Promise<{ updated: boolean; reason?: string }>;

  reconcileQuotedReply(input: {
    companyId: string;
    contextMessageId: string | null | undefined;
    occurredAt?: string | null;
  }): Promise<{ updated: boolean; reason?: string }>;
};
