import { differenceInCalendarDays } from "date-fns";

export type TrialBannerUrgency = "normal" | "soon" | "critical";

export type ResolveTrialBannerInput = {
  canView: boolean;
  companyStatus?: string | null;
  companySubscriptionStatus?: string | null;
  companyExpiresAt?: string | null;
  subscriptionStatus?: string | null;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  now?: Date;
};

export type TrialBannerModel = {
  endsAt: Date | null;
  daysRemaining: number | null;
  urgency: TrialBannerUrgency;
};

function parseDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isCompanyOnTrial(input: {
  companyStatus?: string | null;
  companySubscriptionStatus?: string | null;
  subscriptionStatus?: string | null;
}): boolean {
  const companyStatus = (input.companyStatus ?? "").trim().toLowerCase();
  const companySub = (input.companySubscriptionStatus ?? "").trim().toLowerCase();
  const sub = (input.subscriptionStatus ?? "").trim().toLowerCase();
  return companyStatus === "trial" || companySub === "trialing" || sub === "trialing";
}

/** Resolve trial banner visibility + urgency for dashboard admins/managers. */
export function resolveTrialBanner(input: ResolveTrialBannerInput): TrialBannerModel | null {
  if (!input.canView) return null;
  if (!isCompanyOnTrial(input)) return null;

  const endsAt =
    parseDate(input.trialEndsAt) ??
    parseDate(input.currentPeriodEnd) ??
    parseDate(input.companyExpiresAt);

  const daysRemaining = endsAt
    ? differenceInCalendarDays(endsAt, input.now ?? new Date())
    : null;

  let urgency: TrialBannerUrgency = "normal";
  if (daysRemaining != null) {
    if (daysRemaining <= 3) urgency = "critical";
    else if (daysRemaining <= 7) urgency = "soon";
  }

  return { endsAt, daysRemaining, urgency };
}
