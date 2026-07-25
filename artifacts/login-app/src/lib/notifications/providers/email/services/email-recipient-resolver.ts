import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveRecipientEmail(
  client: SupabaseClient,
  notificationId: string | null,
  params: Record<string, string>,
): Promise<string | null> {
  if (params.email?.trim()) return params.email.trim();
  if (params.recipientEmail?.trim()) return params.recipientEmail.trim();
  if (!notificationId) return null;

  const { data, error } = await client
    .from("notifications")
    .select("user_id")
    .eq("id", notificationId)
    .maybeSingle();

  if (error || !data?.user_id) return null;

  const { data: profile } = await client
    .from("profiles")
    .select("email")
    .eq("id", data.user_id)
    .maybeSingle();

  return profile?.email?.trim() ?? null;
}
