import type { QueryClient } from "@tanstack/react-query";
import { MY_PROFILE_KEY } from "@/hooks/use-my-profile";
import type { MyProfile } from "@/lib/types";

type AuthProfileSeed = {
  id: string;
  company_id: string | null;
  full_name: string | null;
  is_super_admin: boolean;
  preferred_language: string | null;
  timezone: string | null;
  avatar_url: string | null;
};

type AuthCompanySeed = {
  id: string;
  name: string | null;
} | null;

/** Seed React Query with auth bootstrap data to avoid duplicate profile fetch on mount. */
export function seedMyProfileFromAuth(
  queryClient: QueryClient,
  profile: AuthProfileSeed | null,
  company: AuthCompanySeed,
  userId: string,
): void {
  if (!profile) return;

  const existing = queryClient.getQueryData<MyProfile>(MY_PROFILE_KEY);
  if (existing?.email != null) return;

  const seeded: MyProfile = {
    id: profile.id,
    user_id: userId,
    company_id: profile.company_id,
    email: existing?.email ?? null,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url ?? existing?.avatar_url ?? null,
    job_title: existing?.job_title ?? null,
    preferred_language: profile.preferred_language ?? existing?.preferred_language ?? null,
    timezone: profile.timezone ?? existing?.timezone ?? "UTC",
    is_super_admin: profile.is_super_admin,
    is_active: true,
    created_at: existing?.created_at ?? new Date(0).toISOString(),
    updated_at: existing?.updated_at ?? new Date(0).toISOString(),
    company: company
      ? { id: company.id, name: company.name }
      : existing?.company ?? null,
  };

  queryClient.setQueryData(MY_PROFILE_KEY, seeded);
}

/** Write mutation result to cache immediately, then mark for background reconcile. */
export function writeMyProfileCache(
  queryClient: QueryClient,
  updatedProfile: MyProfile,
): void {
  queryClient.setQueryData(MY_PROFILE_KEY, updatedProfile);
  void queryClient.invalidateQueries({ queryKey: MY_PROFILE_KEY });
}
