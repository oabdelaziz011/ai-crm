import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CommunicationReminderSchedule,
  CommunicationTemplateKey,
  ReminderOffset,
} from "@/lib/communication/types";
import type { CommunicationChannel } from "@/lib/communication/types";

type ScheduleRow = {
  id: string;
  company_id: string;
  template_key: string;
  offset_type: string;
  channel: string;
  enabled: boolean;
  reference_type: string;
  reference_id: string;
  scheduled_at: string;
  timezone: string;
  payload: Record<string, unknown>;
  status: string;
};

function mapRow(row: ScheduleRow): CommunicationReminderSchedule {
  return {
    id: row.id,
    companyId: row.company_id,
    templateKey: row.template_key as CommunicationTemplateKey,
    offset: row.offset_type as ReminderOffset,
    channel: row.channel as CommunicationChannel,
    enabled: row.enabled,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    scheduledAt: row.scheduled_at,
    timezone: row.timezone,
    payload: row.payload ?? {},
    status: row.status as CommunicationReminderSchedule["status"],
  };
}

export class ReminderScheduleRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listDue(companyId: string, before = new Date()): Promise<CommunicationReminderSchedule[]> {
    const { data, error } = await this.client
      .from("communication_reminder_schedules")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .eq("enabled", true)
      .lte("scheduled_at", before.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(100);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapRow(row as ScheduleRow));
  }

  async create(input: Omit<CommunicationReminderSchedule, "id" | "status">): Promise<CommunicationReminderSchedule> {
    const { data, error } = await this.client
      .from("communication_reminder_schedules")
      .insert({
        company_id: input.companyId,
        template_key: input.templateKey,
        offset_type: input.offset,
        channel: input.channel,
        enabled: input.enabled,
        reference_type: input.referenceType,
        reference_id: input.referenceId,
        scheduled_at: input.scheduledAt,
        timezone: input.timezone,
        payload: input.payload,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return mapRow(data as ScheduleRow);
  }

  async markSent(id: string): Promise<void> {
    const { error } = await this.client
      .from("communication_reminder_schedules")
      .update({ status: "sent", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async cancelByReference(companyId: string, referenceType: string, referenceId: string): Promise<void> {
    const { error } = await this.client
      .from("communication_reminder_schedules")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("reference_type", referenceType)
      .eq("reference_id", referenceId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
  }
}

const OFFSET_MINUTES: Record<ReminderOffset, number | null> = {
  "24h_before": 24 * 60,
  "3h_before": 3 * 60,
  "1h_before": 60,
  "30m_before": 30,
  after_appointment: -15,
  follow_up: 24 * 60,
  birthday: null,
  recurring: null,
};

/** Pure timezone-aware reminder scheduling. */
export class ReminderScheduler {
  constructor(private readonly repository: ReminderScheduleRepository) {}

  computeScheduledAt(appointmentStartIso: string, offset: ReminderOffset): string | null {
    const minutes = OFFSET_MINUTES[offset];
    if (minutes == null) return null;
    const startMs = new Date(appointmentStartIso).getTime();
    return new Date(startMs - minutes * 60_000).toISOString();
  }

  async scheduleBookingReminders(input: {
    companyId: string;
    bookingId: string;
    appointmentStartIso: string;
    timezone: string;
    channels: CommunicationChannel[];
    offsets?: ReminderOffset[];
  }): Promise<CommunicationReminderSchedule[]> {
    const offsets = input.offsets ?? ["24h_before", "3h_before", "1h_before", "30m_before"];
    const created: CommunicationReminderSchedule[] = [];

    for (const offset of offsets) {
      const scheduledAt = this.computeScheduledAt(input.appointmentStartIso, offset);
      if (!scheduledAt || new Date(scheduledAt) <= new Date()) continue;

      for (const channel of input.channels) {
        const row = await this.repository.create({
          companyId: input.companyId,
          templateKey: "booking_reminder",
          offset,
          channel,
          enabled: true,
          referenceType: "booking",
          referenceId: input.bookingId,
          scheduledAt,
          timezone: input.timezone,
          payload: { bookingId: input.bookingId },
        });
        created.push(row);
      }
    }

    return created;
  }

  listDue(companyId: string): Promise<CommunicationReminderSchedule[]> {
    return this.repository.listDue(companyId);
  }

  cancelBookingReminders(companyId: string, bookingId: string): Promise<void> {
    return this.repository.cancelByReference(companyId, "booking", bookingId);
  }
}
