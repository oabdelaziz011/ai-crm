/**
 * Phase 2 — AI Employee runtime commercial authorization.
 * Enforced at createScopedRuntimeToolPort / applyToolScopeBeforeRoute.
 * Reuses Phase 1 capability catalog; does not create a second feature→tool map.
 */

import {
  isToolMappedInCapabilityCatalog,
  resolveRequiredFeatureCodesForTool,
} from "./ai-employee-capability-catalog.js";

/** Structured internal denial reasons (do not leak to end users as internals). */
export const AI_EMPLOYEE_COMMERCIAL_DENIAL_REASONS = [
  "TOOL_NOT_ASSIGNED",
  "FEATURE_NOT_ENTITLED",
  "UNKNOWN_TOOL",
  "UNMAPPED_TOOL",
  "TENANT_CONTEXT_REQUIRED",
  "TOOL_DISABLED",
] as const;

export type AiEmployeeCommercialDenialReason =
  (typeof AI_EMPLOYEE_COMMERCIAL_DENIAL_REASONS)[number];

/** Safe model-facing message (AR). No database/internal authorization details. */
export const AI_EMPLOYEE_TOOL_SAFE_DENIAL_MESSAGE =
  "هذه الوظيفة غير متاحة لهذا الموظف أو لهذه الشركة.";

export type AiEmployeeCommercialEntitlementPort = {
  /**
   * Existing commercial SoT: public.is_feature_enabled (fail-closed on error).
   * Must NOT skip when isSuperAdmin is true.
   */
  isFeatureEnabled(companyId: string, featureCode: string): Promise<boolean>;
};

export type CommercialToolAccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      denialReason: AiEmployeeCommercialDenialReason;
    };

export type EvaluateCommercialToolAccessInput = {
  toolKey: string;
  /** Trusted ServiceContext / conversation company — never LLM tool args. */
  companyId: string | null | undefined;
  isFeatureEnabled: AiEmployeeCommercialEntitlementPort["isFeatureEnabled"];
  /**
   * Intentionally unused for commercial checks.
   * Commercial entitlement must not be bypassed by RBAC super-admin.
   */
  isSuperAdmin?: boolean;
  /** Optional explicit disabled tool list (fail closed). */
  disabledToolKeys?: ReadonlySet<string> | readonly string[] | null;
};

/**
 * Commercial entitlement check for a tool already known to be assigned to the AI Employee.
 * Assignment is enforced separately (TOOL_NOT_ASSIGNED).
 */
export async function evaluateCommercialToolAccess(
  input: EvaluateCommercialToolAccessInput,
): Promise<CommercialToolAccessDecision> {
  // isSuperAdmin must never short-circuit commercial entitlement.
  void input.isSuperAdmin;

  const toolKey = typeof input.toolKey === "string" ? input.toolKey.trim() : "";
  if (!toolKey) {
    return { allowed: false, denialReason: "UNKNOWN_TOOL" };
  }

  const companyId = typeof input.companyId === "string" ? input.companyId.trim() : "";
  if (!companyId) {
    return { allowed: false, denialReason: "TENANT_CONTEXT_REQUIRED" };
  }

  if (input.disabledToolKeys) {
    const disabled =
      input.disabledToolKeys instanceof Set
        ? input.disabledToolKeys
        : new Set(input.disabledToolKeys);
    if (disabled.has(toolKey)) {
      return { allowed: false, denialReason: "TOOL_DISABLED" };
    }
  }

  if (!isToolMappedInCapabilityCatalog(toolKey)) {
    return { allowed: false, denialReason: "UNMAPPED_TOOL" };
  }

  const required = resolveRequiredFeatureCodesForTool(toolKey);
  if (!required || required.length === 0) {
    return { allowed: false, denialReason: "UNMAPPED_TOOL" };
  }

  for (const featureCode of required) {
    let enabled = false;
    try {
      enabled = await input.isFeatureEnabled(companyId, featureCode);
    } catch {
      return { allowed: false, denialReason: "FEATURE_NOT_ENTITLED" };
    }
    if (!enabled) {
      return { allowed: false, denialReason: "FEATURE_NOT_ENTITLED" };
    }
  }

  return { allowed: true };
}

export type EntitlementRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** Wire existing is_feature_enabled RPC — fail closed on error. */
export function createRpcCommercialEntitlementPort(
  client: EntitlementRpcClient,
): AiEmployeeCommercialEntitlementPort {
  return {
    async isFeatureEnabled(companyId, featureCode) {
      const id = companyId.trim();
      const code = featureCode.trim();
      if (!id || !code) return false;
      try {
        const { data, error } = await client.rpc("is_feature_enabled", {
          p_company_id: id,
          p_feature_code: code,
        });
        if (error) return false;
        return Boolean(data);
      } catch {
        return false;
      }
    },
  };
}

export function createCommercialToolDenialPayload(input: {
  toolKey: string;
  denialReason: AiEmployeeCommercialDenialReason;
  employeeId?: string;
  timestamp?: string;
}): {
  success: false;
  errorCode: AiEmployeeCommercialDenialReason;
  denialReason: AiEmployeeCommercialDenialReason;
  toolKey: string;
  reason: string;
  message: string;
  timestamp: string;
  employeeId?: string;
} {
  const timestamp = input.timestamp ?? new Date().toISOString();
  return {
    success: false,
    errorCode: input.denialReason,
    denialReason: input.denialReason,
    toolKey: input.toolKey,
    reason: AI_EMPLOYEE_TOOL_SAFE_DENIAL_MESSAGE,
    message: AI_EMPLOYEE_TOOL_SAFE_DENIAL_MESSAGE,
    timestamp,
    ...(input.employeeId ? { employeeId: input.employeeId } : {}),
  };
}
