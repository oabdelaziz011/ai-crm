/** Commercial feature code — feature_definitions / is_feature_enabled SoT. */
export const AI_EMPLOYEE_FEATURE_CODE = "ai_employee" as const;

/**
 * Usage metric for successful AI Employee email reply executions.
 * Must exist in usage_metric_definitions before live metering succeeds.
 */
export const AI_EMPLOYEE_EMAIL_USAGE_METRIC_CODE = "ai_employee_email" as const;

export type AiEmployeeEmailAccessDecision = {
  allowed: boolean;
  reason:
    | "entitled"
    | "not_entitled"
    | "quota_exceeded"
    | "entitlement_unavailable"
    | "entitlement_error";
};

/**
 * Fail-closed commercial gate + usage metering for AI Employee on Email channel.
 * Separate from AI Email Routing commercial port.
 */
export type AiEmployeeEmailCommercialPort = {
  checkAccess(input: { companyId: string }): Promise<AiEmployeeEmailAccessDecision>;

  /** Meter one successful AI Employee email reply (idempotent by inboundEventId). */
  recordUsage(input: {
    companyId: string;
    inboundEventId: string;
    aiEmployeeId?: string | null;
  }): Promise<{ recorded: boolean; reason?: string }>;
};
