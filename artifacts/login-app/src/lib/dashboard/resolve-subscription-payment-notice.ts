/**
 * Subscription payment notice — company-admin highlight before / after first payment due.
 * Composes existing subscription clocks (trial_ends_at, next_renewal_at, period end, statuses).
 * Does NOT invent a parallel billing status system.
 */
import { differenceInCalendarDays } from "date-fns";

/** Days before due when the soft “approaching” highlight begins. */
export const SUBSCRIPTION_PAYMENT_REMINDER_DAYS = 7;

export type SubscriptionPaymentNoticePhase =
  | "approaching"
  | "due_today"
  | "unpaid"
  | "locked";

export type SubscriptionPaymentNoticeUrgency = "normal" | "soon" | "critical" | "blocked";

export type ResolveSubscriptionPaymentNoticeInput = {
  /** Company admins with subscription/billing permission only — never regular staff. */
  canView: boolean;
  companyStatus?: string | null;
  companySubscriptionStatus?: string | null;
  companyExpiresAt?: string | null;
  suspensionReason?: string | null;
  subscriptionStatus?: string | null;
  trialEndsAt?: string | null;
  nextRenewalAt?: string | null;
  currentPeriodEnd?: string | null;
  gracePeriodEndsAt?: string | null;
  /** Calendar days before due to start reminding (default 7). */
  reminderDays?: number;
  now?: Date;
};

export type SubscriptionPaymentNoticeModel = {
  phase: SubscriptionPaymentNoticePhase;
  urgency: SubscriptionPaymentNoticeUrgency;
  dueAt: Date | null;
  daysRemaining: number | null;
  /** True when the viewer should see inline pay CTA (admin already gated by canView). */
  showPayCta: boolean;
  /** Soft banner: company still usable. Hard lock is Suspended (separate access block). */
  blocksWorkspace: boolean;
};

function parseDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function resolvePaymentDueAt(input: {
  trialEndsAt?: string | null;
  nextRenewalAt?: string | null;
  currentPeriodEnd?: string | null;
  companyExpiresAt?: string | null;
  gracePeriodEndsAt?: string | null;
  subscriptionStatus?: string | null;
}): Date | null {
  const status = normalizeStatus(input.subscriptionStatus);
  if (status === "grace_period") {
    return (
      parseDate(input.gracePeriodEndsAt) ??
      parseDate(input.nextRenewalAt) ??
      parseDate(input.currentPeriodEnd) ??
      parseDate(input.companyExpiresAt)
    );
  }
  if (status === "trialing") {
    return (
      parseDate(input.trialEndsAt) ??
      parseDate(input.nextRenewalAt) ??
      parseDate(input.currentPeriodEnd) ??
      parseDate(input.companyExpiresAt)
    );
  }
  return (
    parseDate(input.nextRenewalAt) ??
    parseDate(input.currentPeriodEnd) ??
    parseDate(input.trialEndsAt) ??
    parseDate(input.companyExpiresAt)
  );
}

/**
 * Resolve company-admin payment reminder / unpaid highlight.
 * - approaching / due_today / unpaid → soft notice (workspace stays open)
 * - locked → company Suspended (hard lock handled by resolveTenantCompanyAccessBlock)
 * Regular staff: always null (canView=false).
 */
export function resolveSubscriptionPaymentNotice(
  input: ResolveSubscriptionPaymentNoticeInput,
): SubscriptionPaymentNoticeModel | null {
  if (!input.canView) return null;

  const companyStatus = normalizeStatus(input.companyStatus);
  const subStatus = normalizeStatus(
    input.subscriptionStatus ?? input.companySubscriptionStatus,
  );

  if (companyStatus === "suspended") {
    return {
      phase: "locked",
      urgency: "blocked",
      dueAt: null,
      daysRemaining: null,
      showPayCta: false,
      blocksWorkspace: true,
    };
  }

  const unpaidStatuses = new Set(["past_due", "grace_period", "expired"]);
  const approachingStatuses = new Set(["trialing", "active"]);

  const dueAt = resolvePaymentDueAt({
    trialEndsAt: input.trialEndsAt,
    nextRenewalAt: input.nextRenewalAt,
    currentPeriodEnd: input.currentPeriodEnd,
    companyExpiresAt: input.companyExpiresAt,
    gracePeriodEndsAt: input.gracePeriodEndsAt,
    subscriptionStatus: subStatus,
  });

  const now = input.now ?? new Date();
  const daysRemaining = dueAt ? differenceInCalendarDays(dueAt, now) : null;
  const reminderDays = input.reminderDays ?? SUBSCRIPTION_PAYMENT_REMINDER_DAYS;

  if (unpaidStatuses.has(subStatus)) {
    return {
      phase: "unpaid",
      urgency: "critical",
      dueAt,
      daysRemaining,
      // Soft unpaid (incl. expired-not-yet-Suspended): admin can still pay; Suspended is "locked".
      showPayCta: true,
      blocksWorkspace: false,
    };
  }

  if (!approachingStatuses.has(subStatus) && companyStatus !== "trial") {
    return null;
  }

  // Active paid with far-away renewal: no banner.
  if (subStatus === "active" && (daysRemaining == null || daysRemaining > reminderDays)) {
    return null;
  }

  // Trial / nearing renewal within reminder window.
  if (daysRemaining == null) {
    if (subStatus === "trialing" || companyStatus === "trial") {
      return {
        phase: "approaching",
        urgency: "normal",
        dueAt: null,
        daysRemaining: null,
        showPayCta: true,
        blocksWorkspace: false,
      };
    }
    return null;
  }

  if (daysRemaining > reminderDays) {
    return null;
  }

  if (daysRemaining < 0) {
    return {
      phase: "unpaid",
      urgency: "critical",
      dueAt,
      daysRemaining,
      showPayCta: true,
      blocksWorkspace: false,
    };
  }

  if (daysRemaining === 0) {
    return {
      phase: "due_today",
      urgency: "critical",
      dueAt,
      daysRemaining: 0,
      showPayCta: true,
      blocksWorkspace: false,
    };
  }

  return {
    phase: "approaching",
    urgency: daysRemaining <= 3 ? "critical" : "soon",
    dueAt,
    daysRemaining,
    showPayCta: true,
    blocksWorkspace: false,
  };
}
