import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadAssigneeResolverPort, LeadNotificationPort } from "@workspace/lead-platform";
import { getNotificationServices } from "@/lib/notifications";

export function createLoginAppLeadAssigneeResolverPort(client: SupabaseClient): LeadAssigneeResolverPort {
  return {
    async resolveAssigneeLabel(userId) {
      const { data } = await client.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
      return data?.full_name?.trim() || data?.email?.trim() || userId;
    },
    async loadAssigneeLabels(userIds) {
      if (!userIds.length) return new Map();
      const { data } = await client.from("profiles").select("id, full_name, email").in("id", userIds);
      const map = new Map<string, string>();
      for (const row of data ?? []) {
        map.set(String(row.id), row.full_name?.trim() || row.email?.trim() || String(row.id));
      }
      return map;
    },
    async listAssigneeCandidates(companyId) {
      const { data: roles } = await client
        .from("user_roles")
        .select("user_id")
        .eq("company_id", companyId);
      const userIds = [...new Set((roles ?? []).map((r) => String(r.user_id)))];
      if (!userIds.length) return [];

      const { data: leads } = await client
        .from("leads")
        .select("assigned_user_id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .in("assigned_user_id", userIds);

      const counts = new Map<string, number>();
      for (const row of leads ?? []) {
        const id = String(row.assigned_user_id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }

      const { data: assignments } = await client
        .from("lead_assignments")
        .select("assigned_user_id, assigned_at")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .in("assigned_user_id", userIds);

      const lastAssigned = new Map<string, string>();
      for (const row of assignments ?? []) {
        const id = String(row.assigned_user_id);
        const at = String(row.assigned_at);
        if (!lastAssigned.has(id) || at > lastAssigned.get(id)!) lastAssigned.set(id, at);
      }

      return userIds.map((userId) => ({
        userId,
        activeLeadCount: counts.get(userId) ?? 0,
        lastAssignedAt: lastAssigned.get(userId) ?? null,
      }));
    },
  };
}

export function createLeadNotificationBridge(): LeadNotificationPort {
  return {
    async notify(input) {
      await getNotificationServices().notifications.createNotification({
        companyId: input.companyId,
        event: "generic_system",
        userId: input.recipientUserId ?? null,
        recipients: input.recipientUserId
          ? [{ userId: input.recipientUserId, companyId: input.companyId }]
          : [],
        channels: ["in_app"],
        params: {
          title: `Lead ${input.kind.replace("_", " ")}`,
          body: `Lead ${input.leadId}`,
          leadId: input.leadId,
          ...(input.metadata ?? {}),
        },
      });
    },
  };
}
