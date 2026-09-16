/**
 * Resolve a usable Bearer access token for authenticated API calls.
 * getSession() can return a cached JWT that is already expired; the API
 * then rejects with "Invalid or expired session." Refresh when near expiry.
 */
import { supabase } from "@/lib/supabase";
import { accessTokenNeedsRefresh } from "@/lib/auth/access-token-expiry";

export { accessTokenNeedsRefresh, ACCESS_TOKEN_REFRESH_SKEW_MS } from "@/lib/auth/access-token-expiry";

export async function getFreshAccessToken(options?: {
  forceRefresh?: boolean;
}): Promise<string | null> {
  const forceRefresh = options?.forceRefresh === true;

  const { data: initial } = await supabase.auth.getSession();
  const session = initial.session;
  if (!session?.access_token) {
    return null;
  }

  if (!forceRefresh && !accessTokenNeedsRefresh(session.expires_at)) {
    return session.access_token;
  }

  const { data: refreshed, error } = await supabase.auth.refreshSession();
  if (!error && refreshed.session?.access_token) {
    return refreshed.session.access_token;
  }

  // Match avatar-upload: validate user, then re-read session.
  let userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) {
    await supabase.auth.refreshSession();
    userResult = await supabase.auth.getUser();
  }
  if (!userResult.data.user) {
    return null;
  }

  const { data: again } = await supabase.auth.getSession();
  return again.session?.access_token ?? null;
}
