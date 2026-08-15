import type { BillingSubscriptionStatus, CompanySubscription } from "@/lib/billing/types";

export type SaasPaymentEligibilityCode =
  | "PAYMENT_ALLOWED"
  | "PAYMENT_NOT_REQUIRED"
  | "PAYMENT_BLOCKED"
  | "FREE_PACKAGE"
  | "CUSTOM_PRICING"
  | "INVALID_SUBSCRIPTION_STATE"
  | "NO_COMPANY"
  | "NO_SUBSCRIPTION"
  | "NO_PLAN"
  | "UNAUTHORIZED";

export type SaasPaymentEligibility = {
  code: SaasPaymentEligibilityCode;
  allowed: boolean;
  /** Prefer Renew vs Pay Now for past_due/grace */
  action: "pay" | "renew" | "none";
  reasonKey: string;
};

export type SaasPaymentEligibilityInput = {
  canInitiate: boolean;
  companyId: string | null | undefined;
  companyStatus: string | null | undefined;
  approvalStatus: string | null | undefined;
  subscription: Pick<
    CompanySubscription,
    "status" | "billing_cycle" | "plan_id"
  > | null | undefined;
  plan: {
    pricing_mode?: string | null;
    price_monthly?: number | null;
    price_yearly?: number | null;
  } | null | undefined;
};

const PAYABLE_STATUSES: BillingSubscriptionStatus[] = [
  "active",
  "past_due",
  "grace_period",
  "trialing",
];

export function resolveSaasPaymentEligibility(
  input: SaasPaymentEligibilityInput,
): SaasPaymentEligibility {
  if (!input.canInitiate) {
    return {
      code: "UNAUTHORIZED",
      allowed: false,
      action: "none",
      reasonKey: "companyWorkspace.payment.unauthorized",
    };
  }

  if (!input.companyId) {
    return {
      code: "NO_COMPANY",
      allowed: false,
      action: "none",
      reasonKey: "companyWorkspace.payment.noCompany",
    };
  }

  const companyStatus = (input.companyStatus ?? "").trim();
  if (companyStatus === "Suspended") {
    return {
      code: "PAYMENT_BLOCKED",
      allowed: false,
      action: "none",
      reasonKey: "companyWorkspace.payment.companySuspended",
    };
  }

  const approval = (input.approvalStatus ?? "approved").trim().toLowerCase();
  if (approval === "pending" || approval === "rejected") {
    return {
      code: "PAYMENT_BLOCKED",
      allowed: false,
      action: "none",
      reasonKey: "companyWorkspace.payment.companyNotApproved",
    };
  }

  if (!input.subscription) {
    return {
      code: "NO_SUBSCRIPTION",
      allowed: false,
      action: "none",
      reasonKey: "companyWorkspace.payment.noSubscription",
    };
  }

  if (!input.subscription.plan_id || !input.plan) {
    return {
      code: "NO_PLAN",
      allowed: false,
      action: "none",
      reasonKey: "companyWorkspace.payment.noPlan",
    };
  }

  const pricingMode = (input.plan.pricing_mode ?? "fixed").trim().toLowerCase();
  if (pricingMode === "free") {
    return {
      code: "FREE_PACKAGE",
      allowed: false,
      action: "none",
      reasonKey: "companyWorkspace.payment.freePackage",
    };
  }

  if (pricingMode === "custom") {
    return {
      code: "CUSTOM_PRICING",
      allowed: false,
      action: "none",
      reasonKey: "companyWorkspace.payment.customPricing",
    };
  }

  const status = input.subscription.status;
  if (!PAYABLE_STATUSES.includes(status)) {
    return {
      code: "INVALID_SUBSCRIPTION_STATE",
      allowed: false,
      action: "none",
      reasonKey: "companyWorkspace.payment.invalidState",
    };
  }

  const cycle = input.subscription.billing_cycle;
  const amount =
    cycle === "yearly" ? Number(input.plan.price_yearly) : Number(input.plan.price_monthly);
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      code: "CUSTOM_PRICING",
      allowed: false,
      action: "none",
      reasonKey: "companyWorkspace.payment.customPricing",
    };
  }

  const action: "pay" | "renew" =
    status === "past_due" || status === "grace_period" ? "renew" : "pay";

  return {
    code: "PAYMENT_ALLOWED",
    allowed: true,
    action,
    reasonKey: "companyWorkspace.payment.allowed",
  };
}

export function expectedListPriceAmount(
  subscription: Pick<CompanySubscription, "billing_cycle"> | null | undefined,
  plan: { price_monthly?: number | null; price_yearly?: number | null } | null | undefined,
): number | null {
  if (!subscription || !plan) return null;
  const amount =
    subscription.billing_cycle === "yearly"
      ? Number(plan.price_yearly)
      : Number(plan.price_monthly);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}
