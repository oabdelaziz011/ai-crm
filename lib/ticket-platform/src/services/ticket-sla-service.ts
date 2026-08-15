import { SLA_HOURS_BY_PRIORITY } from "../constants.js";
import type { TicketPriority } from "../types/ticket-types.js";

export type TicketSlaHoursByPriority = Record<TicketPriority, number>;

export type TicketSlaSettings = {
  companyId: string;
  urgentHours: number;
  highHours: number;
  normalHours: number;
  lowHours: number;
  warningHours: number;
};

export const DEFAULT_SLA_WARNING_HOURS = 1;

export function defaultSlaHoursByPriority(): TicketSlaHoursByPriority {
  return { ...SLA_HOURS_BY_PRIORITY };
}

export function resolveSlaHoursByPriority(
  settings: TicketSlaSettings | null | undefined,
): TicketSlaHoursByPriority {
  if (!settings) return defaultSlaHoursByPriority();
  return {
    urgent: settings.urgentHours,
    high: settings.highHours,
    normal: settings.normalHours,
    low: settings.lowHours,
  };
}

export function resolveSlaWarningHours(
  settings: TicketSlaSettings | null | undefined,
): number {
  return settings?.warningHours ?? DEFAULT_SLA_WARNING_HOURS;
}

export function computeSlaDueAt(
  priority: TicketPriority,
  referenceNow = new Date(),
  hoursByPriority: TicketSlaHoursByPriority = SLA_HOURS_BY_PRIORITY,
): string {
  const hours = hoursByPriority[priority] ?? SLA_HOURS_BY_PRIORITY[priority];
  const due = new Date(referenceNow.getTime() + hours * 60 * 60 * 1000);
  return due.toISOString();
}

export function isSlaBreached(slaDueAt: string | null, referenceNow = new Date()): boolean {
  if (!slaDueAt) return false;
  return new Date(slaDueAt).getTime() < referenceNow.getTime();
}

export function isSlaWarning(
  slaDueAt: string | null,
  referenceNow = new Date(),
  warningHours = DEFAULT_SLA_WARNING_HOURS,
): boolean {
  if (!slaDueAt) return false;
  const dueMs = new Date(slaDueAt).getTime();
  const nowMs = referenceNow.getTime();
  const warningMs = warningHours * 60 * 60 * 1000;
  return nowMs < dueMs && dueMs - nowMs <= warningMs;
}

export function computeResolutionMinutes(
  createdAt: string,
  resolvedAt: string | null,
): number | null {
  if (!resolvedAt) return null;
  const start = new Date(createdAt).getTime();
  const end = new Date(resolvedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 60000);
}

export function computeResponseMinutes(
  createdAt: string,
  firstResponseAt: string | null,
): number | null {
  if (!firstResponseAt) return null;
  const start = new Date(createdAt).getTime();
  const end = new Date(firstResponseAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 60000);
}

export function computeSlaCompliancePercent(
  totalClosed: number,
  breachedCount: number,
): number {
  if (totalClosed <= 0) return 100;
  const compliant = Math.max(0, totalClosed - breachedCount);
  return Math.round((compliant / totalClosed) * 1000) / 10;
}
