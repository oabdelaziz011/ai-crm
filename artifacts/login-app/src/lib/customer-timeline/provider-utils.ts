import { supabase } from "@/lib/supabase";

export function truncateText(value: string | null | undefined, max = 120): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export async function fetchCustomerConversationIds(
  customerId: string,
  channelType?: string,
): Promise<string[]> {
  let query = supabase
    .from("conversations")
    .select("id")
    .eq("customer_id", customerId)
    .is("deleted_at", null);

  if (channelType) {
    query = query.eq("channel_type", channelType);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row) => row.id);
}

export async function fetchActorNames(userIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, email")
    .in("user_id", unique);

  if (error || !data) return new Map();

  return new Map(
    data.map((profile) => [
      profile.user_id,
      profile.full_name?.trim() || profile.email?.trim() || profile.user_id,
    ]),
  );
}

export async function fetchCustomerDisplayName(customerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("customers")
    .select("name")
    .eq("id", customerId)
    .maybeSingle();

  if (error || !data?.name?.trim()) return null;
  return data.name.trim();
}
