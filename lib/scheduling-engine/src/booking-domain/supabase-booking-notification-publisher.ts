import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingDomainEvent, BookingEventPublisher } from "./events.js";

type ReminderOffset = "24h_before" | "3h_before" | "1h_before" | "30m_before";

const OFFSET_MINUTES: Record<ReminderOffset, number> = {
  "24h_before": 24 * 60,
  "3h_before": 3 * 60,
  "1h_before": 60,
  "30m_before": 30,
};

const REMINDER_OFFSETS: ReminderOffset[] = ["24h_before", "3h_before", "1h_before", "30m_before"];
const REMINDER_CHANNELS = ["whatsapp", "email"] as const;

function computeScheduledAt(appointmentStartIso: string, offset: ReminderOffset): string | null {
  const startMs = new Date(appointmentStartIso).getTime();
  const scheduledAt = new Date(startMs - OFFSET_MINUTES[offset] * 60_000);
  if (scheduledAt <= new Date()) return null;
  return scheduledAt.toISOString();
}

function hashRecipient(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
}

/** Channel-agnostic booking event publisher for runtimes without the login-app communication platform. */
export class SupabaseBookingNotificationPublisher implements BookingEventPublisher {
  constructor(private readonly client: SupabaseClient) {}

  async publish(event: BookingDomainEvent): Promise<void> {
    if (event.type !== "BookingCreated" && event.type !== "BookingRescheduled") {
      if (event.type === "BookingCancelled") {
        try {
          await this.cancelBookingReminders(event.payload.booking.company_id, event.payload.booking.id);
        } catch (error) {
          console.warn(
            "[booking-reminders] cancel failed; booking update continues",
            error instanceof Error ? error.message : error,
          );
        }
      }
      return;
    }

    const booking =
      event.type === "BookingRescheduled" ? event.payload.booking : event.payload.booking;

    const { data: customer } = await this.client
      .from("customers")
      .select("name, email, phone")
      .eq("id", booking.customer_id)
      .maybeSingle();

    const recipientKey = customer?.phone ?? customer?.email ?? booking.customer_id;
    const { error: auditError } = await this.client.from("communication_audit_log").insert({
      company_id: booking.company_id,
      channel: "system",
      template_key: event.type === "BookingCreated" ? "booking_created" : "booking_rescheduled",
      recipient_hash: hashRecipient(recipientKey),
      status: "queued",
      provider: "scheduling-engine",
      idempotency_key: `${event.type}:${booking.id}:${booking.updated_at}`,
      provider_response: {
        bookingId: booking.id,
        customerName: customer?.name ?? "Customer",
      },
    });
    if (auditError) {
      console.warn("[booking-notifications] audit insert failed:", auditError.message);
    }

    try {
      await this.cancelBookingReminders(booking.company_id, booking.id);
      await this.scheduleBookingReminders(booking.company_id, booking.id, booking.start_at, booking.timezone);
    } catch (error) {
      console.warn(
        "[booking-reminders] schedule failed; booking create continues",
        error instanceof Error ? error.message : error,
      );
    }
  }

  private async cancelBookingReminders(companyId: string, bookingId: string): Promise<void> {
    const { error } = await this.client
      .from("communication_reminder_schedules")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("reference_type", "booking")
      .eq("reference_id", bookingId)
      .eq("status", "pending");

    if (error) throw new Error(error.message);
  }

  private async scheduleBookingReminders(
    companyId: string,
    bookingId: string,
    appointmentStartIso: string,
    timezone: string,
  ): Promise<void> {
    for (const offset of REMINDER_OFFSETS) {
      const scheduledAt = computeScheduledAt(appointmentStartIso, offset);
      if (!scheduledAt) continue;

      for (const channel of REMINDER_CHANNELS) {
        const { error } = await this.client.from("communication_reminder_schedules").insert({
          company_id: companyId,
          template_key: "booking_reminder",
          offset_type: offset,
          channel,
          enabled: true,
          reference_type: "booking",
          reference_id: bookingId,
          scheduled_at: scheduledAt,
          timezone,
          payload: { bookingId },
          status: "pending",
        });

        if (error) throw new Error(error.message);
      }
    }
  }
}
