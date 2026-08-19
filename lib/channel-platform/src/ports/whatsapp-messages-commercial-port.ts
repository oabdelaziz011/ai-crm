/** Commercial feature code — feature_definitions / is_feature_enabled SoT. */
export const WHATSAPP_CHANNEL_FEATURE_CODE = "whatsapp_channel" as const;

/**
 * Usage metric for successful WhatsApp outbound messages (Meta wamid accepted).
 * Must exist in usage_metric_definitions before live metering succeeds.
 */
export const WHATSAPP_MESSAGES_USAGE_METRIC_CODE = "whatsapp_messages" as const;

export type WhatsAppMessagesAccessDecision = {
  allowed: boolean;
  reason:
    | "entitled"
    | "not_entitled"
    | "quota_exceeded"
    | "entitlement_unavailable"
    | "entitlement_error";
};

/**
 * Fail-closed commercial gate + usage metering for WhatsApp channel-platform outbound.
 */
export type WhatsAppMessagesCommercialPort = {
  checkAccess(input: { companyId: string }): Promise<WhatsAppMessagesAccessDecision>;

  /** Meter one successful WhatsApp outbound (idempotent by company + Meta wamid). */
  recordUsage(input: {
    companyId: string;
    externalMessageId: string;
    deliveryEventId?: string | null;
    companyChannelId?: string | null;
    /** ingest_usage_event p_source; defaults to channel_platform in adapter. */
    usageSource?: string;
    /** ingest_usage_event reference_type; adapter default channel_delivery_event. */
    referenceType?: string;
    /** ingest_usage_event reference_id; adapter falls back to externalMessageId. */
    referenceId?: string;
  }): Promise<{ recorded: boolean; reason?: string }>;
};
