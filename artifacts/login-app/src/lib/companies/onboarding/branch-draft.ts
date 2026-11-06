/**
 * Registration drafts for company branches.
 * Persisted later on the existing branches table (settings.locationUrl + settings.weeklyHours).
 * Break periods stay on scheduling resources; branch hours do not store them.
 */
import { isHttpLocationUrl } from "@/lib/company/branches/branch-location-url";

export { isHttpLocationUrl };

export const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const;
export type BranchWeekday = (typeof WEEKDAY_INDEXES)[number];

export type BranchDayDraft = {
  dayOfWeek: BranchWeekday;
  closed: boolean;
  opensAt: string;
  closesAt: string;
};

export type BranchDraft = {
  clientId: string;
  name: string;
  address: string;
  locationUrl: string;
  isMain: boolean;
  days: BranchDayDraft[];
};

export type BranchDraftFieldError = "required" | "invalidUrl" | "invalidHours" | "duplicateName";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Suggested hours only. Friday and Saturday start closed so a seven-day week is not assumed. */
export function defaultBranchDays(): BranchDayDraft[] {
  return WEEKDAY_INDEXES.map((dayOfWeek) => {
    const closed = dayOfWeek === 5 || dayOfWeek === 6;
    return {
      dayOfWeek,
      closed,
      opensAt: closed ? "" : "09:00",
      closesAt: closed ? "" : "17:00",
    };
  });
}

export function createBranchDraft(input: {
  isMain: boolean;
  name?: string;
  address?: string;
  locationUrl?: string;
  clientId?: string;
}): BranchDraft {
  return {
    clientId: input.clientId ?? (input.isMain ? "main" : `branch-${Date.now()}`),
    name: input.name ?? "",
    address: input.address ?? "",
    locationUrl: input.locationUrl ?? "",
    isMain: input.isMain,
    days: defaultBranchDays(),
  };
}

export function branchDayIsValid(day: BranchDayDraft): boolean {
  if (day.closed) return true;
  if (!TIME_PATTERN.test(day.opensAt) || !TIME_PATTERN.test(day.closesAt)) return false;
  return day.opensAt < day.closesAt;
}

export function validateBranchDraft(draft: BranchDraft): Partial<Record<"name" | "address" | "locationUrl" | "hours", BranchDraftFieldError>> {
  const errors: Partial<Record<"name" | "address" | "locationUrl" | "hours", BranchDraftFieldError>> = {};
  if (!draft.name.trim()) errors.name = "required";
  else if (draft.name.trim().length > 200) errors.name = "required";
  if (!draft.address.trim()) errors.address = "required";
  if (!draft.locationUrl.trim()) errors.locationUrl = "required";
  else if (!isHttpLocationUrl(draft.locationUrl)) errors.locationUrl = "invalidUrl";
  const openDays = draft.days.filter((day) => !day.closed);
  if (openDays.length === 0 || draft.days.some((day) => !branchDayIsValid(day))) {
    errors.hours = "invalidHours";
  }
  return errors;
}

export function validateBranchDrafts(drafts: BranchDraft[]): {
  ok: boolean;
  byId: Record<string, ReturnType<typeof validateBranchDraft>>;
} {
  const byId: Record<string, ReturnType<typeof validateBranchDraft>> = {};
  const names = new Map<string, string>();
  let ok = drafts.length > 0 && drafts.filter((draft) => draft.isMain).length === 1;

  for (const draft of drafts) {
    const errors = validateBranchDraft(draft);
    const key = draft.name.trim().toLocaleLowerCase();
    if (key) {
      const previous = names.get(key);
      if (previous) {
        errors.name = "duplicateName";
        const prior = byId[previous] ?? {};
        byId[previous] = { ...prior, name: "duplicateName" };
        ok = false;
      } else {
        names.set(key, draft.clientId);
      }
    }
    byId[draft.clientId] = errors;
    if (Object.keys(errors).length > 0) ok = false;
  }

  return { ok, byId };
}

export type OnboardingBranchRpcItem = {
  name: string;
  address: string;
  location_url: string;
  is_main: boolean;
  timezone: string;
  city: string;
  country: string;
  weekly_hours: Array<{
    day_of_week: BranchWeekday;
    is_closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
  }>;
};

export function branchDraftsToRpcPayload(
  drafts: BranchDraft[],
  context: { timezone: string; city: string; country: string },
): OnboardingBranchRpcItem[] {
  return drafts.map((draft) => ({
    name: draft.name.trim(),
    address: draft.address.trim(),
    location_url: draft.locationUrl.trim(),
    is_main: draft.isMain,
    timezone: context.timezone.trim() || "UTC",
    city: context.city.trim(),
    country: context.country.trim(),
    weekly_hours: draft.days.map((day) => ({
      day_of_week: day.dayOfWeek,
      is_closed: day.closed,
      opens_at: day.closed ? null : day.opensAt,
      closes_at: day.closed ? null : day.closesAt,
    })),
  }));
}
