import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NotificationChannel,
  NotificationPreference,
  NotificationPriority,
} from "@/lib/notifications/types";

type PreferenceRow = {
  id: string;
  company_id: string;
  user_id: string | null;
  scope: "user" | "tenant";
  channel: NotificationChannel | null;
  min_priority: NotificationPriority | null;
  muted: boolean;
  working_hours: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function mapPreferenceRow(row: PreferenceRow): NotificationPreference {
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    scope: row.scope,
    channel: row.channel,
    minPriority: row.min_priority,
    muted: row.muted,
    workingHours: row.working_hours as NotificationPreference["workingHours"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class NotificationPreferenceRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(companyId: string, userId?: string | null): Promise<NotificationPreference[]> {
    let builder = this.client
      .from("notification_preferences")
      .select("*")
      .eq("company_id", companyId);

    if (userId) {
      builder = builder.or(`user_id.eq.${userId},scope.eq.tenant`);
    }

    const { data, error } = await builder;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapPreferenceRow(row as PreferenceRow));
  }

  async upsert(
    preference: Omit<NotificationPreference, "id" | "createdAt" | "updatedAt">,
  ): Promise<NotificationPreference> {
    const { data, error } = await this.client
      .from("notification_preferences")
      .upsert(
        {
          company_id: preference.companyId,
          user_id: preference.userId,
          scope: preference.scope,
          channel: preference.channel,
          min_priority: preference.minPriority,
          muted: preference.muted,
          working_hours: preference.workingHours,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,user_id,scope,channel" },
      )
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return mapPreferenceRow(data as PreferenceRow);
  }
}
