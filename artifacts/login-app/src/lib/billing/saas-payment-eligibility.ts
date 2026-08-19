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
  | "UNAUTHORIZED"
  | "NOT_CONFIGURED"
  | "AWAITING_APPROVAL"
  | "INVALID_PAYABLE";

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
  payableAmount?: number | null;
  payableSource?: string | null;
  onlineCheckoutAllowed?: boolean | null;
  preApprovalPaid?: boolean | null;
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
  if (approval === "rejected") {
    return {
      code: "PAYMENT_BLOCKED",
      allowed: false,
      action: "none",
      reasonKey: "companyWorkspace.payment.companyRejected",
    };
  }

  if (approval === "pending" && input.preApprovalPaid) {
    return {
      code: "AWAITING_APPROVAL",
      allowed: false,
      action: "none",
      reasonKey: "companyWorkspace.payment.awaitingApproval",
    };
  }

  if (!input.subscription) {
    return {
      code: approval === "pending" ? "NOT_CONFIGURED" : "NO_SUBSCRIPTION",
      allowed: false,
      action: "none",
      reasonKey:
        approval === "pending"
          ? "companyWorkspace.payment.notConfigured"
          : "companyWorkspace.payment.noSubscription",
    };
  }

  if (!input.subscription.plan_id || !input.plan) {
    return {
      code: approval === "pending" ? "NOT_CONFIGURED" : "NO_PLAN",
      allowed: false,
      action: "none",
      reasonKey:
        approval === "pending"
          ? "companyWorkspace.payment.notConfigured"
          : "companyWorkspace.payment.noPlan",
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

  const catalogAmount = expectedListPriceAmount(input.subscription, input.plan);
  const payable =
    input.payableAmount == null || input.payableAmount === undefined
      ? catalogAmount
      : Number(input.payableAmount);
  const source = (input.payableSource ?? "").trim().toLowerCase();
  const serverAllowsOnline = input.onlineCheckoutAllowed !== false;

  if (pricingMode === "custom" && source !== "custom" && source !== "discount") {
    return {
      code: "CUSTOM_PRICING",
      allowed: false,
      action: "none",
      reasonKey: "companyWorkspace.payment.customPricing",
    };
  }

  if (payable == null || !Number.isFinite(payable) || payable <= 0) {
    return {
      code: approval === "pending" ? "NOT_CONFIGURED" : "INVALID_PAYABLE",
      allowed: false,
      action: "none",
      reasonKey:
        approval === "pending"
          ? "companyWorkspace.payment.notConfigured"
          : "companyWorkspace.payment.invalidPayable",
    };
  }

  if (!serverAllowsOnline) {
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

  const action: "pay" | "renew" =
    status === "past_due" || status === "grace_period" ? "renew" : "pay";

  return {
    code: "PAYMENT_ALLOWED",
    allowed: true,
    action,
    reasonKey:
      approval === "pending"
        ? "companyWorkspace.payment.paymentRequired"
        : "companyWorkspace.payment.allowed",
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
