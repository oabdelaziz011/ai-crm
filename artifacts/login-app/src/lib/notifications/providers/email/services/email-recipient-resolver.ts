import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveRecipientEmail(
  client: SupabaseClient,
  notificationId: string | null,
  params: Record<string, string>,
): Promise<string | null> {
  if (params.email?.trim()) return params.email.trim();
  if (params.recipientEmail?.trim()) return params.recipientEmail.trim();
  if (params.customerEmail?.trim()) return params.customerEmail.trim();

  const customerId = params.customerId?.trim() || params.customer_id?.trim();
  if (customerId) {
    const { data: customer } = await client
      .from("customers")
      .select("email")
      .eq("id", customerId)
      .maybeSingle();
    if (customer?.email?.trim()) return customer.email.trim();
  }

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
