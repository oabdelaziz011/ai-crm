import { SLA_HOURS_BY_PRIORITY, DEFAULT_SLA_WARNING_HOURS } from "@workspace/ticket-platform";

export type TicketSlaSettingsFormValues = {
  urgentHours: number;
  highHours: number;
  normalHours: number;
  lowHours: number;
  warningHours: number;
};

export const DEFAULT_TICKET_SLA_SETTINGS: TicketSlaSettingsFormValues = {
  urgentHours: SLA_HOURS_BY_PRIORITY.urgent,
  highHours: SLA_HOURS_BY_PRIORITY.high,
  normalHours: SLA_HOURS_BY_PRIORITY.normal,
  lowHours: SLA_HOURS_BY_PRIORITY.low,
  warningHours: DEFAULT_SLA_WARNING_HOURS,
};

export function normalizeTicketSlaSettings(
  row: Partial<{
    urgent_hours: number;
    high_hours: number;
    normal_hours: number;
    low_hours: number;
    warning_hours: number;
  }> | null,
): TicketSlaSettingsFormValues {
  if (!row) return { ...DEFAULT_TICKET_SLA_SETTINGS };
  return {
    urgentHours: Number(row.urgent_hours) || DEFAULT_TICKET_SLA_SETTINGS.urgentHours,
    highHours: Number(row.high_hours) || DEFAULT_TICKET_SLA_SETTINGS.highHours,
    normalHours: Number(row.normal_hours) || DEFAULT_TICKET_SLA_SETTINGS.normalHours,
    lowHours: Number(row.low_hours) || DEFAULT_TICKET_SLA_SETTINGS.lowHours,
    warningHours: Number(row.warning_hours) || DEFAULT_TICKET_SLA_SETTINGS.warningHours,
  };
}
