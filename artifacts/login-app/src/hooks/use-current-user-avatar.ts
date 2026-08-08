import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useMyProfile } from "@/hooks/use-my-profile";
import { resolveAvatarDisplayUrl } from "@/lib/avatar-url";

/**
 * Global current-user avatar — single source `profiles.avatar_url`.
 * Prefer React Query `my-profile` so uploads invalidate and update instantly.
 */
export function useCurrentUserAvatar() {
  const { profile: authProfile, displayName, user } = useAuth();
  const { data: myProfile } = useMyProfile();

  return useMemo(() => {
    const avatarUrl =
      myProfile?.avatar_url ?? authProfile?.avatar_url ?? null;
    const name =
      myProfile?.full_name?.trim() ||
      displayName ||
      user?.email?.split("@")[0] ||
      "User";
    const initial = name.charAt(0).toUpperCase() || "U";
    const src = resolveAvatarDisplayUrl(avatarUrl);

    return {
      avatarUrl,
      src,
      name,
      initial,
      email: myProfile?.email ?? user?.email ?? null,
      userId: myProfile?.id ?? authProfile?.id ?? user?.id ?? null,
    };
  }, [
    authProfile?.avatar_url,
    authProfile?.id,
    displayName,
    myProfile?.avatar_url,
    myProfile?.email,
    myProfile?.full_name,
    myProfile?.id,
    user?.email,
    user?.id,
  ]);
}
