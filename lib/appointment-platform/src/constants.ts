export const APPOINTMENT_PERMISSIONS = {
  view: "bookings.view",
  create: "bookings.create",
  edit: "bookings.edit",
  delete: "bookings.delete",
  manage: "bookings.edit",
} as const;

export const APPOINTMENT_DOMAIN_EVENTS = [
  "appointment_created",
  "appointment_updated",
  "appointment_cancelled",
  "appointment_completed",
  "appointment_confirmed",
  "appointment_rescheduled",
  "appointment_no_show",
  "appointment_checked_in",
  "appointment_resource_assigned",
] as const;

export const APPOINTMENT_WORKFLOW_EVENTS: Record<(typeof APPOINTMENT_DOMAIN_EVENTS)[number], string> = {
  appointment_created: "appointment.created",
  appointment_updated: "appointment.updated",
  appointment_cancelled: "appointment.cancelled",
  appointment_completed: "appointment.completed",
  appointment_confirmed: "appointment.confirmed",
  appointment_rescheduled: "appointment.rescheduled",
  appointment_no_show: "appointment.no_show",
  appointment_checked_in: "appointment.checked_in",
  appointment_resource_assigned: "appointment.resource_assigned",
};

export const APPOINTMENT_QUERY_CACHE_TTL = {
  metrics: 5 * 60 * 1000,
  appointment: 30 * 1000,
  search: 30 * 1000,
  calendar: 60 * 1000,
} as const;

export const UPCOMING_APPOINTMENT_STATUSES = ["pending", "confirmed", "checked_in"] as const;
export const TERMINAL_APPOINTMENT_STATUSES = ["completed", "cancelled", "no_show", "rescheduled"] as const;
