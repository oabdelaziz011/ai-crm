/** Commercial feature code — feature_definitions / is_feature_enabled SoT. */
export const AI_EMAIL_ROUTING_FEATURE_CODE = "ai_email_routing" as const;

/**
 * Usage metric code for ingest_usage_event.
 * Must exist in usage_metric_definitions before live metering succeeds.
 */
export const AI_EMAIL_ROUTING_USAGE_METRIC_CODE = "ai_email_routing" as const;

export type AiEmailRoutingAccessDecision = {
  allowed: boolean;
  /** Safe machine reason for traces (no email content). */
  reason:
    | "entitled"
    | "not_entitled"
    | "quota_exceeded"
    | "entitlement_unavailable"
    | "entitlement_error";
};

export type AiEmailRoutingCommercialPort = {
  /**
   * Fail-closed commercial + quota gate.
   * Uses existing is_feature_enabled / entitlement architecture.
   */
  checkAccess(input: { companyId: string }): Promise<AiEmailRoutingAccessDecision>;

  /**
   * Meter one AI Email Routing processing attempt (idempotent by inboundEventId).
   */
  recordUsage(input: {
    companyId: string;
    inboundEventId: string;
    category?: string;
    source?: string;
  }): Promise<{ recorded: boolean; reason?: string }>;
};
