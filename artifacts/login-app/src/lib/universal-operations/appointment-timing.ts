import type { OperationsRow } from "@workspace/universal-operations-engine";
import { resolveOperationsStatusKey } from "@/lib/i18n/operations-queue-labels";

const WAITING_OR_SCHEDULED = new Set(["waiting", "scheduled", "pending", "booked", "confirmed"]);
const STARTING_SOON_MS = 15 * 60_000;

export type AppointmentTimingState =
  | { kind: "late"; minutes: number }
  | { kind: "starting_soon"; minutes: number }
  | { kind: "none" };

function appointmentInstant(row: OperationsRow): Date | null {
  const raw = row.values.appointment_time ?? row.values.scheduled_at;
  if (raw == null || raw === "") return null;
  const date = new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date;
}

function statusKey(row: OperationsRow): string | null {
  return resolveOperationsStatusKey(row.statusId, row.values.status, null);
}

/** Late when appointment time passed and status is still Scheduled/Waiting. */
export function resolveAppointmentTiming(row: OperationsRow, now = Date.now()): AppointmentTimingState {
  const start = appointmentInstant(row);
  if (!start) return { kind: "none" };
  const key = statusKey(row);
  if (!key || !WAITING_OR_SCHEDULED.has(key)) return { kind: "none" };

  const diff = now - start.getTime();
  if (diff > 0) {
    return { kind: "late", minutes: Math.max(1, Math.floor(diff / 60_000)) };
  }
  const until = start.getTime() - now;
  if (until > 0 && until <= STARTING_SOON_MS) {
    return { kind: "starting_soon", minutes: Math.max(1, Math.ceil(until / 60_000)) };
  }
  return { kind: "none" };
}

export function isAppointmentLate(row: OperationsRow, now = Date.now()): boolean {
  return resolveAppointmentTiming(row, now).kind === "late";
}

export type PriorityDisplay = "high" | "medium" | "normal" | "low";

/** Map engine priority → operator badges (High / Medium / Normal / Low). */
export function resolvePriorityDisplay(priority: OperationsRow["priority"] | string | undefined): PriorityDisplay {
  const token = String(priority ?? "normal").toLowerCase();
  if (token === "urgent" || token === "high") return token === "urgent" ? "high" : "medium";
  if (token === "low") return "low";
  if (token === "medium") return "medium";
  return "normal";
}

export const PRIORITY_COLORS: Record<PriorityDisplay, string> = {
  high: "#dc2626",
  medium: "#f59e0b",
  normal: "#64748b",
  low: "#94a3b8",
};
