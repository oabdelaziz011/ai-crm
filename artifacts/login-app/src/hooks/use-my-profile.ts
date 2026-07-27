import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { normalizeAvatarUrl } from "@/lib/avatar-url";
import type { AppLanguage } from "@/lib/i18n/resolve-app-language";
import type { MyProfile, MyProfileUpdate } from "@/lib/types";

export const MY_PROFILE_KEY = ["my-profile"] as const;

const PROFILE_COLUMNS_FULL = `
  id,
  user_id,
  company_id,
  email,
  full_name,
  avatar_url,
  job_title,
  preferred_language,
  timezone,
  is_super_admin,
  is_active,
  created_at,
  updated_at,
  companies (
    id,
    name
  )
`;

const PROFILE_COLUMNS_LEGACY = `
  id,
  user_id,
  company_id,
  email,
  full_name,
  avatar_url,
  is_super_admin,
  is_active,
  created_at,
  updated_at,
  companies (
    id,
    name
  )
`;

function isMissingColumnError(message: string | undefined): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist")
    && (normalized.includes("column") || normalized.includes("42703"))
  );
}

function isMissingRpcError(message: string | undefined): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("update_my_profile")
    && (
      normalized.includes("could not find")
      || normalized.includes("not found")
      || normalized.includes("42883")
      || normalized.includes("pgrst202")
    )
  );
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeCompanyEmbed(raw: unknown): MyProfile["company"] {
  if (!raw) {
    return null;
  }

  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === "object" && "id" in first) {
      return {
        id: asString((first as { id?: unknown }).id),
        name: asNullableString((first as { name?: unknown }).name),
      };
    }
    return null;
  }

  if (typeof raw === "object" && "id" in raw) {
    const record = raw as { id?: unknown; name?: unknown };
    return {
      id: asString(record.id),
      name: asNullableString(record.name),
    };
  }

  return null;
}

function normalizeMyProfile(
  row: Record<string, unknown>,
  options: { hasPreferenceColumns: boolean },
): MyProfile {
  const company = normalizeCompanyEmbed(row.companies);

  return {
    id: asString(row.id),
    user_id: asString(row.user_id),
    company_id: asNullableString(row.company_id),
    email: asNullableString(row.email),
    full_name: asNullableString(row.full_name),
    avatar_url: asNullableString(row.avatar_url),
    job_title: options.hasPreferenceColumns
      ? asNullableString(row.job_title)
      : null,
    preferred_language: options.hasPreferenceColumns
      ? asNullableString(row.preferred_language)
      : null,
    timezone: options.hasPreferenceColumns
      ? (asNullableString(row.timezone) ?? "UTC")
      : "UTC",
    is_super_admin: row.is_super_admin === true,
    is_active: row.is_active !== false,
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
    company: company ?? null,
  };
}

async function fetchProfileRow(userId: string, columns: string) {
  const byId = await supabase
    .from("profiles")
    .select(columns)
    .eq("id", userId)
    .maybeSingle();

  if (!byId.error && byId.data) {
    return { data: byId.data, error: null as null };
  }

  if (byId.error && !isMissingColumnError(byId.error.message)) {
    return { data: null, error: byId.error };
  }

  const byUserId = await supabase
    .from("profiles")
    .select(columns)
    .eq("user_id", userId)
    .maybeSingle();

  return { data: byUserId.data, error: byUserId.error };
}

async function fetchMyProfile(): Promise<MyProfile> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  const fullResult = await fetchProfileRow(user.id, PROFILE_COLUMNS_FULL);
  if (!fullResult.error && fullResult.data) {
    return normalizeMyProfile(fullResult.data as unknown as Record<string, unknown>, {
      hasPreferenceColumns: true,
    });
  }

  if (fullResult.error && !isMissingColumnError(fullResult.error.message)) {
    throw new Error(fullResult.error.message);
  }

  const legacyResult = await fetchProfileRow(user.id, PROFILE_COLUMNS_LEGACY);
  if (legacyResult.error) {
    throw new Error(legacyResult.error.message);
  }

  if (!legacyResult.data) {
    throw new Error("Profile not found");
  }

  return normalizeMyProfile(legacyResult.data as unknown as Record<string, unknown>, {
    hasPreferenceColumns: false,
  });
}

export function useMyProfile() {
  return useQuery({
    queryKey: MY_PROFILE_KEY,
    queryFn: fetchMyProfile,
    staleTime: 60_000,
  });
}

export function useUpdateMyProfile() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (values: MyProfileUpdate) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Not authenticated");
      }

      const avatarUrl = normalizeAvatarUrl(values.avatar_url ?? null);
      if (values.avatar_url && !avatarUrl) {
        throw new Error("Invalid avatar URL");
      }

      const { data, error } = await supabase.rpc("update_my_profile", {
        p_full_name: values.full_name?.trim() ?? "",
        p_avatar_url: avatarUrl,
        p_preferred_language: values.preferred_language ?? null,
        p_timezone: values.timezone ?? "UTC",
      });

      if (error) {
        if (isMissingRpcError(error.message) || isMissingColumnError(error.message)) {
          throw new Error(
            "Profile updates are unavailable until database migration 029_profile_self_service_security.sql is applied.",
          );
        }
        throw new Error(error.message);
      }

      const profileRow = Array.isArray(data) ? data[0] : data;
      if (!profileRow) {
        throw new Error("Profile update failed");
      }

      const refreshed = await fetchMyProfile();
      return refreshed ?? normalizeMyProfile(profileRow as Record<string, unknown>, {
        hasPreferenceColumns: true,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MY_PROFILE_KEY });
    },
  });
}

export function useUpdatePreferredLanguage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (preferredLanguage: AppLanguage) => {
      const profile = await fetchMyProfile();

      const { data, error } = await supabase.rpc("update_my_profile", {
        p_full_name: profile.full_name?.trim() ?? "",
        p_avatar_url: profile.avatar_url,
        p_preferred_language: preferredLanguage,
        p_timezone: profile.timezone ?? "UTC",
      });

      if (error) {
        if (isMissingRpcError(error.message) || isMissingColumnError(error.message)) {
          throw new Error(
            "Profile updates are unavailable until database migration 029_profile_self_service_security.sql is applied.",
          );
        }
        throw new Error(error.message);
      }

      const profileRow = Array.isArray(data) ? data[0] : data;
      if (!profileRow) {
        throw new Error("Profile update failed");
      }

      return fetchMyProfile();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MY_PROFILE_KEY });
    },
  });
}
