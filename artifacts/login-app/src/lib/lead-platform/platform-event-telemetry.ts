const PLATFORM_EVENT_TELEMETRY_TABLES = [
  "platform_event_audit",
  "platform_event_timeline",
  "platform_event_correlations",
  "platform_event_idempotency",
  "platform_event_subscriber_telemetry",
] as const;

/**
 * Event-bus audit, timeline, and correlation writes are telemetry.
 * A row-level denial on those tables must stay observable and must not be treated
 * as a failed qualification or a failed opportunity promotion.
 * Denials on any other table stay required failures.
 */
export function isPlatformEventTelemetryFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: unknown; message?: unknown };
  if (String(row.code ?? "") !== "42501") return false;
  const message = String(row.message ?? "");
  return PLATFORM_EVENT_TELEMETRY_TABLES.some((table) => message.includes(table));
}
