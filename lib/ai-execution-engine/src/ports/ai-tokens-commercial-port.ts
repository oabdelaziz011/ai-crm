/** Commercial feature code — feature_definitions / is_feature_enabled SoT. */
export const AI_ASSISTANT_FEATURE_CODE = "ai_assistant" as const;

/**
 * Usage metric for successful AI Assistant executions with provider-reported tokens.
 * Must exist in usage_metric_definitions before live metering succeeds.
 */
export const AI_TOKENS_USAGE_METRIC_CODE = "ai_tokens" as const;

export type AiTokensCommercialDenyReason =
  | "not_entitled"
  | "quota_exceeded"
  | "entitlement_unavailable"
  | "entitlement_error";

export type AiTokensAccessDecision =
  | { allowed: true; reason: "entitled" }
  | { allowed: false; reason: AiTokensCommercialDenyReason };

/**
 * Fail-closed commercial gate + usage metering for AI Assistant token usage.
 * Quantity is provider-reported total_tokens only.
 */
export type AiTokensCommercialPort = {
  checkAccess(input: { companyId: string }): Promise<AiTokensAccessDecision>;

  /** Meter provider-reported tokens (idempotent by company + execution id). */
  recordUsage(input: {
    companyId: string;
    executionId: string;
    quantity: number;
  }): Promise<{ recorded: boolean; reason?: string }>;
};
