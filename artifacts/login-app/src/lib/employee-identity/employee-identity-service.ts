import { supabase } from "@/lib/supabase";
import type { EmployeeIdentity } from "./types";

const IDENTITY_COLUMNS =
  "id, user_id, email, full_name, avatar_url, job_title, department, phone, bio, extension_number, preferred_language, timezone, is_active" as const;

type ProfileIdentityRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  bio: string | null;
  extension_number: string | null;
  preferred_language: string | null;
  timezone: string | null;
  is_active: boolean | null;
};

function resolveDisplayName(row: ProfileIdentityRow): string {
  const name = row.full_name?.trim();
  if (name) return name;
  const email = row.email?.trim();
  if (email) return email;
  return "Unknown";
}

export function mapProfileToEmployeeIdentity(row: ProfileIdentityRow): EmployeeIdentity {
  const jobTitle = row.job_title?.trim() || null;
  const department = row.department?.trim() || null;
  return Object.freeze({
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : null,
    fullName: resolveDisplayName(row),
    email: row.email?.trim() || null,
    avatarUrl: row.avatar_url?.trim() || null,
    phone: row.phone?.trim() || null,
    jobTitle,
    department,
    status: row.is_active === false ? "inactive" : "active",
    language: row.preferred_language?.trim() || null,
    timezone: row.timezone?.trim() || null,
    bio: row.bio?.trim() || null,
    extensionNumber: row.extension_number?.trim() || null,
    presence: null,
    lastSeenAt: null,
  });
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

/**
 * ONE reusable identity reader for the whole platform.
 * Always reads from `public.profiles` — never duplicate employee tables.
 */
export const EmployeeIdentityService = Object.freeze({
  async getById(profileOrUserId: string): Promise<EmployeeIdentity | null> {
    const id = profileOrUserId.trim();
    if (!id) return null;

    const byId = await supabase
      .from("profiles")
      .select(IDENTITY_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (!byId.error && byId.data) {
      return mapProfileToEmployeeIdentity(byId.data as ProfileIdentityRow);
    }

    const byUser = await supabase
      .from("profiles")
      .select(IDENTITY_COLUMNS)
      .eq("user_id", id)
      .maybeSingle();

    if (byUser.error || !byUser.data) return null;
    return mapProfileToEmployeeIdentity(byUser.data as ProfileIdentityRow);
  },

  async getManyByIds(ids: readonly string[]): Promise<Map<string, EmployeeIdentity>> {
    const unique = uniqueIds(ids);
    const map = new Map<string, EmployeeIdentity>();
    if (unique.length === 0) return map;

    const [byId, byUser] = await Promise.all([
      supabase.from("profiles").select(IDENTITY_COLUMNS).in("id", unique),
      supabase.from("profiles").select(IDENTITY_COLUMNS).in("user_id", unique),
    ]);

    const rows = [
      ...((byId.data ?? []) as ProfileIdentityRow[]),
      ...((byUser.data ?? []) as ProfileIdentityRow[]),
    ];
    for (const row of rows) {
      const identity = mapProfileToEmployeeIdentity(row);
      map.set(identity.id, identity);
      if (identity.userId) map.set(identity.userId, identity);
    }
    return map;
  },

  async listByCompany(companyId: string, limit = 200): Promise<EmployeeIdentity[]> {
    const { data, error } = await supabase
      .from("profiles")
      .select(IDENTITY_COLUMNS)
      .eq("company_id", companyId)
      .order("full_name", { ascending: true })
      .limit(limit);

    if (error || !data) return [];
    return (data as ProfileIdentityRow[]).map(mapProfileToEmployeeIdentity);
  },
});
