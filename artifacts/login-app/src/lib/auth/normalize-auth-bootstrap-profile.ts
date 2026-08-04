import type { AuthBootstrapProfile } from "@/lib/auth/load-user-auth-context";

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Normalize RPC/REST profile payloads into AuthBootstrapProfile. */
export function normalizeAuthBootstrapProfile(raw: unknown): AuthBootstrapProfile | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  if (!id) return null;

  return {
    id,
    company_id: asNullableString(record.company_id),
    full_name: asNullableString(record.full_name),
    is_super_admin: record.is_super_admin === true,
    preferred_language: asNullableString(record.preferred_language),
    preferred_theme: asNullableString(record.preferred_theme),
    timezone: asNullableString(record.timezone) ?? "UTC",
    avatar_url: asNullableString(record.avatar_url),
  };
}

export function authBootstrapProfilesEqual(
  left: AuthBootstrapProfile | null,
  right: AuthBootstrapProfile | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;

  return (
    left.id === right.id
    && left.company_id === right.company_id
    && left.full_name === right.full_name
    && left.is_super_admin === right.is_super_admin
    && left.preferred_language === right.preferred_language
    && left.preferred_theme === right.preferred_theme
    && left.timezone === right.timezone
    && left.avatar_url === right.avatar_url
  );
}
