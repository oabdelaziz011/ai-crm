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
  const { EmployeeIdentityService } = await import("@/lib/employee-identity/employee-identity-service");
  const identities = await EmployeeIdentityService.getManyByIds(userIds);
  const map = new Map<string, string>();
  for (const id of userIds) {
    const identity = identities.get(id);
    if (identity) map.set(id, identity.fullName);
  }
  return map;
}

/** Prefer this over fetchActorNames when avatar / job title are needed. */
export async function fetchActorIdentities(userIds: string[]) {
  const { EmployeeIdentityService } = await import("@/lib/employee-identity/employee-identity-service");
  return EmployeeIdentityService.getManyByIds(userIds);
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
