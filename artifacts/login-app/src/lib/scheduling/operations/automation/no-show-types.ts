export const NO_SHOW_GRACE_OPTIONS = [5, 10, 15, 20, 30] as const;

export type NoShowGracePeriodMinutes = (typeof NO_SHOW_GRACE_OPTIONS)[number];

export type NoShowRuleConfig = {
  id: string;
  companyId: string;
  branchId: string | null;
  enabled: boolean;
  gracePeriodMinutes: NoShowGracePeriodMinutes;
};

export type NoShowEvaluationResult = {
  bookingId: string;
  branchId: string | null;
  gracePeriodMinutes: number;
  minutesPastStart: number;
};
