/**
 * Unified effective quota policy — pure resolution and access evaluation.
 * Does not invoice, bill, or write usage. Server-side enforcement consumes this output.
 */

export type EffectiveQuotaSource = "company_override" | "plan_limit" | "none";

export type CompanyUsageLimitOverrideRow = {
  included_quantity: number | null;
  is_unlimited: boolean;
  overage_allowed: boolean;
  overage_unit_size: number | null;
  overage_unit_price: number | null;
};

export type EffectiveQuotaPolicy = {
  configured: boolean;
  included_quantity: number | null;
  unlimited: boolean;
  overage_allowed: boolean;
  overage_unit_size: number | null;
  overage_unit_price: number | null;
  source: EffectiveQuotaSource;
};

export type QuotaAccessEvaluation = {
  allowed: boolean;
  /** True when usage is at/above included and overage_allowed permits continuation. */
  overageApplicable: boolean;
};

const NONE_POLICY: EffectiveQuotaPolicy = {
  configured: false,
  included_quantity: null,
  unlimited: false,
  overage_allowed: false,
  overage_unit_size: null,
  overage_unit_price: null,
  source: "none",
};

function parseFiniteQuantity(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/** Parse plan_features.limit_value JSON into a monthly/numeric included quantity. */
export function parsePlanLimitValue(raw: unknown): number | null {
  if (raw == null) return null;
  const direct = parseFiniteQuantity(raw);
  if (direct != null) return direct;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    for (const key of ["monthly", "max", "limit", "count", "quantity"]) {
      const parsed = parseFiniteQuantity(record[key]);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

function parseOptionalNumber(value: unknown): number | null {
  const parsed = parseFiniteQuantity(value);
  return parsed;
}

/**
 * Merge company override + plan limit using precedence:
 * 1. Company override (unlimited or included_quantity)
 * 2. Plan limit_value
 * 3. No quota configured
 */
export function resolveEffectiveQuotaPolicyFromSources(input: {
  companyOverride: CompanyUsageLimitOverrideRow | null;
  planLimitValue: unknown;
}): EffectiveQuotaPolicy {
  const override = input.companyOverride;

  if (override?.is_unlimited) {
    return {
      configured: true,
      included_quantity: null,
      unlimited: true,
      overage_allowed: false,
      overage_unit_size: null,
      overage_unit_price: null,
      source: "company_override",
    };
  }

  const companyIncluded = parseFiniteQuantity(override?.included_quantity ?? null);
  if (companyIncluded != null) {
    return {
      configured: true,
      included_quantity: companyIncluded,
      unlimited: false,
      overage_allowed: Boolean(override?.overage_allowed),
      overage_unit_size: parseOptionalNumber(override?.overage_unit_size),
      overage_unit_price: parseOptionalNumber(override?.overage_unit_price),
      source: "company_override",
    };
  }

  const planIncluded = parsePlanLimitValue(input.planLimitValue);
  if (planIncluded != null) {
    return {
      configured: true,
      included_quantity: planIncluded,
      unlimited: false,
      overage_allowed: false,
      overage_unit_size: null,
      overage_unit_price: null,
      source: "plan_limit",
    };
  }

  return { ...NONE_POLICY };
}

/**
 * Evaluate access for a known usage total against an effective policy.
 * Missing/unlimited policy → allow. Does not charge overage.
 */
export function evaluateQuotaAccess(
  policy: EffectiveQuotaPolicy,
  usage: number,
): QuotaAccessEvaluation {
  if (!policy.configured || policy.unlimited) {
    return { allowed: true, overageApplicable: false };
  }

  const included = policy.included_quantity;
  if (included == null || !Number.isFinite(included)) {
    return { allowed: true, overageApplicable: false };
  }

  if (usage < included) {
    return { allowed: true, overageApplicable: false };
  }

  if (policy.overage_allowed) {
    return { allowed: true, overageApplicable: true };
  }

  return { allowed: false, overageApplicable: false };
}
