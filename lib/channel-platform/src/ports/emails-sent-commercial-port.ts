/** Commercial feature code — feature_definitions / is_feature_enabled SoT. */
export const EMAIL_CHANNEL_FEATURE_CODE = "email_channel" as const;

/**
 * Usage metric for successful notification SMTP sends.
 * Must exist in usage_metric_definitions before live metering succeeds.
 */
export const EMAILS_SENT_USAGE_METRIC_CODE = "emails_sent" as const;

export type EmailsSentAccessDecision = {
  allowed: boolean;
  reason:
    | "entitled"
    | "not_entitled"
    | "quota_exceeded"
    | "entitlement_unavailable"
    | "entitlement_error";
};

/**
 * Fail-closed commercial gate + usage metering for notification-queue SMTP email.
 * Do not use for conversational EmailCloudAdapter / AI Employee email replies.
 */
export type EmailsSentCommercialPort = {
  checkAccess(input: { companyId: string }): Promise<EmailsSentAccessDecision>;

  /** Meter one successful notification SMTP send (idempotent by company + queue id). */
  recordUsage(input: {
    companyId: string;
    queueId: string;
  }): Promise<{ recorded: boolean; reason?: string }>;
};
