import type { BillingContact, CompanySubscription } from "@/lib/billing/types";

export type ProvisioningIssue =
  | "company_not_found"
  | "subscription_missing"
  | "plan_missing"
  | "billing_contact_missing"
  | "pricing_missing";

export type CompanyProvisioningResult = {
  ready: boolean;
  issues: ProvisioningIssue[];
};

export type CompanyProvisioningInput = {
  companyExists: boolean;
  subscription: CompanySubscription | null | undefined;
  billingContact: BillingContact | null | undefined;
};

export function evaluateCompanyProvisioning(input: CompanyProvisioningInput): CompanyProvisioningResult {
  const issues: ProvisioningIssue[] = [];

  if (!input.companyExists) {
    issues.push("company_not_found");
    return { ready: false, issues };
  }

  const subscription = input.subscription;
  if (!subscription) {
    issues.push("subscription_missing");
    return { ready: false, issues };
  }

  if (!subscription.plan_id || !subscription.plan) {
    issues.push("plan_missing");
  }

  if (!input.billingContact) {
    issues.push("billing_contact_missing");
  }

  const planPrice =
    subscription.billing_cycle === "yearly"
      ? subscription.plan?.price_yearly
      : subscription.plan?.price_monthly;
  if (planPrice == null || Number(planPrice) <= 0) {
    issues.push("pricing_missing");
  }

  return {
    ready: issues.length === 0,
    issues,
  };
}
