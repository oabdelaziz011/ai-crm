/**
 * Customer CRM lifecycle + acquisition source constants (pure).
 */

export const CUSTOMER_LIFECYCLE_STATUSES = ["active", "inactive", "blocked"] as const;
export type CustomerLifecycleStatus = (typeof CUSTOMER_LIFECYCLE_STATUSES)[number];

export const CUSTOMER_ACQUISITION_SOURCES = [
  "whatsapp",
  "messenger",
  "instagram",
  "email",
  "sms",
  "website",
  "manual",
  "other",
] as const;
export type CustomerAcquisitionSource = (typeof CUSTOMER_ACQUISITION_SOURCES)[number];

const STATUS_SET = new Set<string>(CUSTOMER_LIFECYCLE_STATUSES);
const SOURCE_SET = new Set<string>(CUSTOMER_ACQUISITION_SOURCES);

/** Map conversation.channel_type → CRM acquisition source. */
export function customerSourceFromChannelType(
  channelType: string | null | undefined,
): CustomerAcquisitionSource | null {
  const key = String(channelType ?? "")
    .trim()
    .toLowerCase();
  switch (key) {
    case "whatsapp":
      return "whatsapp";
    case "messenger":
      return "messenger";
    case "instagram":
      return "instagram";
    case "email":
      return "email";
    case "sms":
      return "sms";
    case "web_chat":
    case "website":
    case "web":
      return "website";
    case "telegram":
    case "voice":
      return "other";
    default:
      return null;
  }
}

export function normalizeCustomerLifecycleStatus(
  value: string | null | undefined,
): CustomerLifecycleStatus {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  return STATUS_SET.has(key) ? (key as CustomerLifecycleStatus) : "active";
}

export function normalizeCustomerAcquisitionSource(
  value: string | null | undefined,
): CustomerAcquisitionSource | null {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  return SOURCE_SET.has(key) ? (key as CustomerAcquisitionSource) : null;
}

export function validateLifecycleReason(input: {
  nextStatus: CustomerLifecycleStatus;
  reason: string | null | undefined;
}): { ok: true; reason: string | null } | { ok: false; code: "REASON_REQUIRED" } {
  const trimmed = String(input.reason ?? "").trim();
  if (input.nextStatus === "inactive" || input.nextStatus === "blocked") {
    if (!trimmed) return { ok: false, code: "REASON_REQUIRED" };
    return { ok: true, reason: trimmed };
  }
  return { ok: true, reason: null };
}

export function lifecycleActionsForStatus(status: CustomerLifecycleStatus): {
  canDeactivate: boolean;
  canBlock: boolean;
  canActivate: boolean;
} {
  switch (status) {
    case "active":
      return { canDeactivate: true, canBlock: true, canActivate: false };
    case "inactive":
      return { canDeactivate: false, canBlock: true, canActivate: true };
    case "blocked":
      return { canDeactivate: false, canBlock: false, canActivate: true };
    default:
      return { canDeactivate: true, canBlock: true, canActivate: false };
  }
}

/**
 * Age in whole years from DOB. Returns null when DOB missing/invalid.
 * Does not invent DOB from legacy age.
 */
export function ageFromDateOfBirth(
  dateOfBirth: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (dateOfBirth == null || dateOfBirth === "") return null;
  const dob =
    dateOfBirth instanceof Date ? dateOfBirth : new Date(`${String(dateOfBirth).trim()}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  if (dob.getTime() > now.getTime()) return null;

  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  if (age < 0 || age > 150) return null;
  return age;
}

/** Prefer DOB-derived age; fall back to legacy persisted age only when no DOB. */
export function displayCustomerAge(input: {
  dateOfBirth?: string | null;
  age?: number | null;
  now?: Date;
}): number | null {
  const fromDob = ageFromDateOfBirth(input.dateOfBirth, input.now);
  if (fromDob != null) return fromDob;
  if (input.age == null || Number.isNaN(Number(input.age))) return null;
  const legacy = Number(input.age);
  if (legacy < 0 || legacy > 150) return null;
  return legacy;
}

export function isValidDateOfBirthInput(value: string | null | undefined): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const dob = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return false;
  const min = new Date("1900-01-01T00:00:00");
  const max = new Date();
  max.setHours(23, 59, 59, 999);
  return dob.getTime() >= min.getTime() && dob.getTime() <= max.getTime();
}
