/**
 * Tenant sales follow-up policy. Disabled until a company saves enabled: true.
 * This module decides; it does not call a channel provider.
 */

export const SALES_FOLLOW_UP_CHANNELS = ["whatsapp", "web_chat", "email", "instagram", "facebook", "sms"] as const;
export type SalesFollowUpChannel = (typeof SALES_FOLLOW_UP_CHANNELS)[number];

export type SalesFollowUpSettings = {
  enabled: boolean;
  channels: SalesFollowUpChannel[];
  firstDelayMinutes: number;
  subsequentIntervalMinutes: number[];
  maxAttempts: number;
  timezone: string;
  businessHours: { start: string; end: string; days: number[] };
  approvalMode: "draft" | "automatic";
  stopOnCustomerReply: boolean;
  stopOnConversion: boolean;
  stopOnPurchase: boolean;
  stopOnOptOut: boolean;
  stopOnClosedRequest: boolean;
  stopOnReassignment: boolean;
  companyDailyLimit: number;
};

export type SalesFollowUpOutcome = "scheduled" | "sent" | "draft" | "skipped" | "failed" | "cancelled" | "retried";

export type SalesFollowUpDecision = {
  outcome: SalesFollowUpOutcome;
  reason: string;
  send: boolean;
  idempotencyKey: string;
};

export type SalesFollowUpSnapshot = {
  companyId: string;
  leadId: string;
  attemptNumber: number;
  dueAt: Date;
  now: Date;
  settings: SalesFollowUpSettings;
  channel: SalesFollowUpChannel | null;
  channelConnected: boolean;
  channelCanSend: boolean;
  optedOut: boolean;
  customerRepliedAfterSchedule: boolean;
  converted: boolean;
  purchased: boolean;
  requestClosed: boolean;
  assigneeChanged: boolean;
  attemptsAlreadySent: number;
  companySentToday: number;
  idempotencyKeySeen: boolean;
  transientFailure: boolean;
  withinBusinessHours: boolean;
};

/**
 * Defaults for new/empty company rows.
 * maxAttempts = total follow-up messages including the first (not “extras after first”).
 * Schedule ladder (editable in settings): 24h, 3d, 7d from the eligibility anchor.
 */
export const DEFAULT_SALES_FOLLOW_UP_SETTINGS: SalesFollowUpSettings = {
  enabled: false,
  channels: [],
  firstDelayMinutes: 24 * 60,
  subsequentIntervalMinutes: [3 * 24 * 60, 7 * 24 * 60],
  maxAttempts: 3,
  timezone: "UTC",
  businessHours: { start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] },
  approvalMode: "draft",
  stopOnCustomerReply: true,
  stopOnConversion: true,
  stopOnPurchase: true,
  stopOnOptOut: true,
  stopOnClosedRequest: true,
  stopOnReassignment: true,
  companyDailyLimit: 50,
};

/**
 * One attempt number ⇒ one provider-send identity.
 * dueAt is intentionally excluded: transient retries bump job.due_at for scheduling,
 * but must reclaim the same attempt row (not mint a new key).
 */
export function salesFollowUpIdempotencyKey(
  companyId: string,
  leadId: string,
  attemptNumber: number,
  _dueAt?: Date,
): string {
  return `${companyId}:${leadId}:${attemptNumber}`;
}

export function normalizeSalesFollowUpSettings(value: Partial<SalesFollowUpSettings> | null | undefined): SalesFollowUpSettings {
  const input = value ?? {};
  const channels = (input.channels ?? []).filter((channel): channel is SalesFollowUpChannel =>
    (SALES_FOLLOW_UP_CHANNELS as readonly string[]).includes(channel),
  );
  const maxAttempts = clampInt(input.maxAttempts, 1, 5, DEFAULT_SALES_FOLLOW_UP_SETTINGS.maxAttempts);
  return {
    enabled: input.enabled === true,
    channels,
    firstDelayMinutes: clampInt(input.firstDelayMinutes, 15, 14 * 24 * 60, DEFAULT_SALES_FOLLOW_UP_SETTINGS.firstDelayMinutes),
    subsequentIntervalMinutes: (input.subsequentIntervalMinutes ?? [])
      .map((minutes) => clampInt(minutes, 15, 14 * 24 * 60, 0))
      .filter((minutes) => minutes > 0)
      .slice(0, 4),
    maxAttempts,
    timezone: typeof input.timezone === "string" && input.timezone.trim() ? input.timezone.trim() : "UTC",
    businessHours: {
      start: input.businessHours?.start || "09:00",
      end: input.businessHours?.end || "17:00",
      days: (input.businessHours?.days ?? [1, 2, 3, 4, 5]).filter((day) => day >= 0 && day <= 6),
    },
    approvalMode: input.approvalMode === "automatic" ? "automatic" : "draft",
    stopOnCustomerReply: input.stopOnCustomerReply !== false,
    stopOnConversion: input.stopOnConversion !== false,
    stopOnPurchase: input.stopOnPurchase !== false,
    stopOnOptOut: input.stopOnOptOut !== false,
    stopOnClosedRequest: input.stopOnClosedRequest !== false,
    stopOnReassignment: input.stopOnReassignment !== false,
    companyDailyLimit: clampInt(input.companyDailyLimit, 1, 500, DEFAULT_SALES_FOLLOW_UP_SETTINGS.companyDailyLimit),
  };
}

/** Recheck this immediately before any send. A scheduler tick alone never authorizes delivery. */
export function evaluateSalesFollowUp(snapshot: SalesFollowUpSnapshot): SalesFollowUpDecision {
  const settings = normalizeSalesFollowUpSettings(snapshot.settings);
  const idempotencyKey = salesFollowUpIdempotencyKey(
    snapshot.companyId,
    snapshot.leadId,
    snapshot.attemptNumber,
    snapshot.dueAt,
  );
  const decide = (outcome: SalesFollowUpOutcome, reason: string, send = false): SalesFollowUpDecision => ({
    outcome,
    reason,
    send,
    idempotencyKey,
  });

  if (!settings.enabled) return decide("skipped", "automation_disabled");
  if (settings.stopOnOptOut && snapshot.optedOut) return decide("cancelled", "opt_out");
  if (settings.stopOnCustomerReply && snapshot.customerRepliedAfterSchedule) return decide("cancelled", "customer_replied");
  if (settings.stopOnConversion && snapshot.converted) return decide("cancelled", "converted");
  if (settings.stopOnPurchase && snapshot.purchased) return decide("cancelled", "purchased");
  if (settings.stopOnClosedRequest && snapshot.requestClosed) return decide("cancelled", "request_closed");
  if (settings.stopOnReassignment && snapshot.assigneeChanged) return decide("cancelled", "reassigned");
  if (snapshot.idempotencyKeySeen) return decide("skipped", "duplicate_attempt");
  if (snapshot.attemptsAlreadySent >= settings.maxAttempts) return decide("skipped", "max_attempts");
  if (snapshot.companySentToday >= settings.companyDailyLimit) return decide("skipped", "company_daily_limit");
  if (snapshot.now.getTime() < snapshot.dueAt.getTime()) return decide("scheduled", "not_due");
  if (!snapshot.withinBusinessHours) return decide("skipped", "outside_business_hours");
  if (!snapshot.channel || !settings.channels.includes(snapshot.channel) || !snapshot.channelConnected) {
    return decide("draft", "channel_unavailable");
  }
  if (!snapshot.channelCanSend) return decide("draft", "channel_send_not_allowed");
  if (snapshot.transientFailure) return decide("retried", "transient_failure");
  if (settings.approvalMode !== "automatic") return decide("draft", "approval_required");
  return decide("sent", "eligible", true);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}
