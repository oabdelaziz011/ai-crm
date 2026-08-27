/**
 * Package selection during company commercial review must use assign (bootstrap)
 * while the company is pending approval or the subscription is still trialing.
 * change_company_package_v1 rejects trialing subscriptions by design.
 */
export type ReviewPackageSelectionContext = {
  pending: boolean;
  subscriptionStatus?: string | null;
  subscriptionPlanId?: string | null;
};

export function shouldAssignPackageDuringReview(ctx: ReviewPackageSelectionContext): boolean {
  if (ctx.pending) return true;
  if (ctx.subscriptionStatus === "trialing") return true;
  if (!ctx.subscriptionPlanId) return true;
  return false;
}

export function resolveReviewSelectedPlanId(input: {
  pending: boolean;
  subscriptionPlanId?: string | null;
  companyPlanId?: string | null;
}): string | null {
  const subscriptionPlanId = input.subscriptionPlanId ?? null;
  if (input.pending) return subscriptionPlanId;
  return subscriptionPlanId ?? input.companyPlanId ?? null;
}
