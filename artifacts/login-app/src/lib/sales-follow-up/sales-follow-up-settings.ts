import {
  DEFAULT_SALES_FOLLOW_UP_SETTINGS,
  DEFAULT_SALES_FOLLOW_UP_SCHEDULE_STEPS,
  normalizeSalesFollowUpSettings,
  salesFollowUpScheduleSteps,
  settingsFromScheduleSteps,
  SALES_FOLLOW_UP_CHANNELS,
  type SalesFollowUpChannel,
  type SalesFollowUpScheduleStep,
  type SalesFollowUpSettings,
} from "@workspace/automation-platform";

export type SalesFollowUpSettingsFormValues = SalesFollowUpSettings & {
  scheduleSteps: SalesFollowUpScheduleStep[];
};

export const SALES_FOLLOW_UP_CHANNEL_OPTIONS = SALES_FOLLOW_UP_CHANNELS;

export const DEFAULT_SALES_FOLLOW_UP_FORM: SalesFollowUpSettingsFormValues = {
  ...DEFAULT_SALES_FOLLOW_UP_SETTINGS,
  scheduleSteps: salesFollowUpScheduleSteps(DEFAULT_SALES_FOLLOW_UP_SETTINGS),
};

/**
 * `unconfigured` = no settings row yet (never saved); `disabled` = row exists with enabled=false.
 * Derived from the read only; nothing is ever written or auto-enabled for an unconfigured company.
 */
export type SalesFollowUpConfigState = "unconfigured" | "disabled" | "enabled";

export function salesFollowUpConfigState(
  row: { enabled?: boolean | null } | null | undefined,
): SalesFollowUpConfigState {
  if (!row) return "unconfigured";
  return row.enabled === true ? "enabled" : "disabled";
}

export type SalesFollowUpSettingsSnapshot = {
  form: SalesFollowUpSettingsFormValues;
  configState: SalesFollowUpConfigState;
};

export type SalesFollowUpDraftsInboxState =
  | "loading"
  | "error"
  | "unconfigured"
  | "disabled"
  | "empty"
  | "list";

/**
 * Drafts inbox view state. Existing items always win (drafts created before a disable stay reviewable).
 * With no items, an unconfigured/disabled feature is explained instead of a bare "empty".
 * `configState` is null while loading or when settings could not be read (never assumed disabled).
 */
export function resolveSalesFollowUpDraftsInboxState(input: {
  isLoading: boolean;
  hasError: boolean;
  itemCount: number;
  configState: SalesFollowUpConfigState | null;
}): SalesFollowUpDraftsInboxState {
  if (input.isLoading) return "loading";
  if (input.hasError) return "error";
  if (input.itemCount > 0) return "list";
  if (input.configState === "unconfigured") return "unconfigured";
  if (input.configState === "disabled") return "disabled";
  return "empty";
}

export function normalizeSalesFollowUpForm(
  row: Partial<{
    enabled: boolean;
    channels: string[] | null;
    first_delay_minutes: number | null;
    subsequent_interval_minutes: number[] | null;
    max_attempts: number | null;
    timezone: string | null;
    business_hours: SalesFollowUpSettings["businessHours"] | null;
    approval_mode: string | null;
    stop_on_customer_reply: boolean | null;
    stop_on_conversion: boolean | null;
    stop_on_purchase: boolean | null;
    stop_on_opt_out: boolean | null;
    stop_on_closed_request: boolean | null;
    stop_on_reassignment: boolean | null;
    company_daily_limit: number | null;
  }> | null,
): SalesFollowUpSettingsFormValues {
  if (!row) return { ...DEFAULT_SALES_FOLLOW_UP_FORM };
  const settings = normalizeSalesFollowUpSettings({
    enabled: row.enabled === true,
    channels: (row.channels ?? []).filter((channel): channel is SalesFollowUpChannel =>
      (SALES_FOLLOW_UP_CHANNELS as readonly string[]).includes(channel),
    ),
    firstDelayMinutes: row.first_delay_minutes ?? undefined,
    subsequentIntervalMinutes: row.subsequent_interval_minutes ?? undefined,
    maxAttempts: row.max_attempts ?? undefined,
    timezone: row.timezone ?? undefined,
    businessHours: row.business_hours ?? undefined,
    approvalMode: row.approval_mode === "automatic" ? "automatic" : "draft",
    stopOnCustomerReply: row.stop_on_customer_reply !== false,
    stopOnConversion: row.stop_on_conversion !== false,
    stopOnPurchase: row.stop_on_purchase !== false,
    stopOnOptOut: row.stop_on_opt_out !== false,
    stopOnClosedRequest: row.stop_on_closed_request !== false,
    stopOnReassignment: row.stop_on_reassignment !== false,
    companyDailyLimit: row.company_daily_limit ?? undefined,
  });
  return {
    ...settings,
    scheduleSteps: salesFollowUpScheduleSteps(settings),
  };
}

/** Validate before save. maxAttempts = total follow-ups including the first. */
export function validateSalesFollowUpForm(values: SalesFollowUpSettingsFormValues): string | null {
  if (values.enabled && (!values.channels || values.channels.length === 0)) {
    return "channels_required_when_enabled";
  }
  const enabledSteps = (values.scheduleSteps ?? []).filter((step) => step.enabled && step.amount > 0);
  if (values.enabled && enabledSteps.length === 0) {
    return "schedule_steps_required";
  }
  if (enabledSteps.length > 5) {
    return "max_attempts_exceeded";
  }
  for (const step of enabledSteps) {
    if (!Number.isFinite(step.amount) || step.amount < 1) {
      return "invalid_step_amount";
    }
  }
  return null;
}

export function applyScheduleStepsToForm(
  values: SalesFollowUpSettingsFormValues,
  steps: SalesFollowUpScheduleStep[],
): SalesFollowUpSettingsFormValues {
  const next = settingsFromScheduleSteps(values, steps);
  return {
    ...values,
    ...next,
    scheduleSteps: salesFollowUpScheduleSteps(next),
  };
}

export function defaultScheduleStepsTemplate(): SalesFollowUpScheduleStep[] {
  return DEFAULT_SALES_FOLLOW_UP_SCHEDULE_STEPS.map((step) => ({ ...step }));
}

export function salesFollowUpFormToRow(companyId: string, values: SalesFollowUpSettingsFormValues) {
  const withSteps = applyScheduleStepsToForm(
    values,
    values.scheduleSteps?.length ? values.scheduleSteps : salesFollowUpScheduleSteps(values),
  );
  const normalized = normalizeSalesFollowUpSettings(withSteps);
  return {
    company_id: companyId,
    enabled: normalized.enabled,
    channels: normalized.channels,
    first_delay_minutes: normalized.firstDelayMinutes,
    subsequent_interval_minutes: normalized.subsequentIntervalMinutes,
    max_attempts: normalized.maxAttempts,
    timezone: normalized.timezone,
    business_hours: normalized.businessHours,
    approval_mode: normalized.approvalMode,
    stop_on_customer_reply: normalized.stopOnCustomerReply,
    stop_on_conversion: normalized.stopOnConversion,
    stop_on_purchase: normalized.stopOnPurchase,
    stop_on_opt_out: normalized.stopOnOptOut,
    stop_on_closed_request: normalized.stopOnClosedRequest,
    stop_on_reassignment: normalized.stopOnReassignment,
    company_daily_limit: normalized.companyDailyLimit,
    updated_at: new Date().toISOString(),
  };
}
