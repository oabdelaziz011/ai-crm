import { differenceInCalendarDays } from "date-fns";
import type { TFunction } from "i18next";
import { formatLocalizedDate, translateSubscriptionStatus } from "@/lib/billing/billing-display-i18n";
import type { BillingSubscriptionStatus } from "@/lib/billing/types";
import i18n from "@/i18n";

export type SubscriptionStatusDisplay = {
  label: string;
  contextLine: string | null;
};

function daysRemainingLabel(t: TFunction, date: Date | null, now = new Date()): string | null {
  if (!date) return null;
  const days = differenceInCalendarDays(date, now);
  if (days < 0) return null;
  if (days === 0) return t("billing.statusContext.endsToday");
  if (days === 1) return t("billing.statusContext.endsTomorrow");
  return t("billing.statusContext.daysRemaining", { count: days });
}

function renewsInLabel(t: TFunction, date: Date | null, now = new Date()): string | null {
  if (!date) return null;
  const days = differenceInCalendarDays(date, now);
  if (days < 0) return null;
  if (days === 0) return t("billing.statusContext.renewsToday");
  if (days === 1) return t("billing.statusContext.renewsTomorrow");
  return t("billing.statusContext.renewsInDays", { count: days });
}

export function getSubscriptionStatusDisplay(
  input: {
    status: BillingSubscriptionStatus;
    currentPeriodEnd?: string | null;
    nextRenewalAt?: string | null;
    trialEndsAt?: string | null;
    gracePeriodEndsAt?: string | null;
    now?: Date;
  },
  t: TFunction,
): SubscriptionStatusDisplay {
  const now = input.now ?? new Date();
  const label = translateSubscriptionStatus(t, input.status);

  switch (input.status) {
    case "trialing": {
      const end = input.trialEndsAt ?? input.currentPeriodEnd;
      return { label, contextLine: daysRemainingLabel(t, end ? new Date(end) : null, now) };
    }
    case "active":
      return {
        label,
        contextLine: renewsInLabel(
          t,
          input.nextRenewalAt
            ? new Date(input.nextRenewalAt)
            : input.currentPeriodEnd
              ? new Date(input.currentPeriodEnd)
              : null,
          now,
        ),
      };
    case "grace_period":
      return {
        label,
        contextLine: daysRemainingLabel(
          t,
          input.gracePeriodEndsAt ? new Date(input.gracePeriodEndsAt) : null,
          now,
        ),
      };
    case "past_due":
      return { label, contextLine: t("billing.statusContext.paymentOverdue") };
    case "expired":
      return { label, contextLine: t("billing.statusContext.paymentRequired") };
    case "canceled": {
      const end = input.currentPeriodEnd;
      if (end && new Date(end) > now) {
        const formatted = formatLocalizedDate(new Date(end), i18n.language);
        return {
          label,
          contextLine: formatted ? t("billing.statusContext.accessUntil", { date: formatted }) : null,
        };
      }
      return { label, contextLine: null };
    }
    default:
      return { label, contextLine: null };
  }
}

export function isUuidSegment(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
