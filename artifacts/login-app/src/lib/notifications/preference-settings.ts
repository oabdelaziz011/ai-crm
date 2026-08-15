/**
 * Helpers for staff notification preference settings.
 * Event mutes are stored in working_hours.mutedEvents (existing jsonb — no migration).
 */
import type {
  NotificationChannel,
  NotificationEvent,
  NotificationPreference,
  NotificationWorkingHours,
} from "@/lib/notifications/types";

export const BOOKING_NOTIFICATION_EVENTS: NotificationEvent[] = [
  "appointment_created",
  "appointment_updated",
  "appointment_cancelled",
  "appointment_reminder",
];

export const INVOICE_PAID_NOTIFICATION_EVENTS: NotificationEvent[] = [
  "payment_received",
];

export type NotificationTopicId = "new_bookings" | "invoice_paid";

export const NOTIFICATION_TOPIC_EVENTS: Record<NotificationTopicId, NotificationEvent[]> = {
  new_bookings: BOOKING_NOTIFICATION_EVENTS,
  invoice_paid: INVOICE_PAID_NOTIFICATION_EVENTS,
};

/** Channels users can mute from settings (real delivery paths). */
export const SETTINGS_MUTABLE_CHANNELS: NotificationChannel[] = [
  "in_app",
  "email",
  "whatsapp",
];

export function readMutedEvents(
  preferences: NotificationPreference[],
  userId: string | null,
): NotificationEvent[] {
  const bags = preferences.filter(
    (p) =>
      p.channel === null &&
      Array.isArray((p.workingHours as { mutedEvents?: unknown } | null)?.mutedEvents) &&
      (p.scope === "tenant" || (p.scope === "user" && p.userId === userId)),
  );
  const events: NotificationEvent[] = [];
  for (const bag of bags) {
    const raw = (bag.workingHours as { mutedEvents?: string[] } | null)?.mutedEvents ?? [];
    for (const e of raw) {
      if (typeof e === "string") events.push(e as NotificationEvent);
    }
  }
  return events;
}

export function isChannelEnabled(
  preferences: NotificationPreference[],
  userId: string | null,
  channel: NotificationChannel,
): boolean {
  const userPref = preferences.find(
    (p) => p.scope === "user" && p.userId === userId && p.channel === channel,
  );
  if (userPref?.muted) return false;

  const tenantPref = preferences.find(
    (p) => p.scope === "tenant" && p.channel === channel,
  );
  if (tenantPref?.muted) return false;

  return true;
}

export function isTopicEnabled(
  preferences: NotificationPreference[],
  userId: string | null,
  topic: NotificationTopicId,
): boolean {
  const muted = new Set(readMutedEvents(preferences, userId));
  const events = NOTIFICATION_TOPIC_EVENTS[topic];
  // Topic enabled when none of its events are muted
  return !events.some((e) => muted.has(e));
}

export function buildMutedEventsForTopicToggle(
  current: NotificationEvent[],
  topic: NotificationTopicId,
  enabled: boolean,
): NotificationEvent[] {
  const topicEvents = new Set(NOTIFICATION_TOPIC_EVENTS[topic]);
  const next = current.filter((e) => !topicEvents.has(e));
  if (!enabled) {
    for (const e of topicEvents) next.push(e);
  }
  return [...new Set(next)];
}

export function buildEventMuteWorkingHours(
  mutedEvents: NotificationEvent[],
): NotificationWorkingHours {
  return {
    timezone: "UTC",
    startHour: 0,
    endHour: 24,
    days: [0, 1, 2, 3, 4, 5, 6],
    mutedEvents,
  };
}
