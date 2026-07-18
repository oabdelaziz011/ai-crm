import { format } from "date-fns";

/** Empty-state label for profile/settings read-only fields. */
export const PROFILE_EMPTY_DISPLAY = "—";

/** Safe date formatting — never throws; returns null when value is missing or invalid. */
export function safeFormatProfileDate(
  value: string | null | undefined,
  pattern: string,
): string | null {
  if (!value?.trim()) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  try {
    return format(date, pattern);
  } catch {
    return null;
  }
}

/** Trim and collapse empty strings to null. */
export function safeDisplayText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Read company name from object or legacy array embed shapes. */
export function safeCompanyName(
  company: { name?: string | null } | Array<{ name?: string | null }> | null | undefined,
): string | null {
  if (!company) {
    return null;
  }

  if (Array.isArray(company)) {
    return safeDisplayText(company[0]?.name);
  }

  return safeDisplayText(company.name);
}

/** Join role names from auth context; tolerates missing roles array entries. */
export function safeRoleLabel(
  roles: Array<{ name?: string | null } | null | undefined> | null | undefined,
): string | null {
  const names = (roles ?? [])
    .map((role) => safeDisplayText(role?.name ?? null))
    .filter(Boolean) as string[];

  return names.length > 0 ? names.join(", ") : null;
}

/** Resolve email from profile row or auth user metadata without throwing. */
export function safeAuthEmail(
  user: { email?: string | null } | null | undefined,
  profileEmail?: string | null,
): string | null {
  return safeDisplayText(profileEmail ?? user?.email ?? null);
}

/** Render helper: value or empty-state dash. */
export function withProfileEmpty(
  value: string | null | undefined,
  empty: string = PROFILE_EMPTY_DISPLAY,
): string {
  return safeDisplayText(value) ?? empty;
}

/** Guard optional arrays before map/filter/reduce in render paths. */
export function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}
