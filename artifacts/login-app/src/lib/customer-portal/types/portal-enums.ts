export const PORTAL_AUTH_METHODS = ["otp", "magic_link", "oauth"] as const;
export type PortalAuthMethod = (typeof PORTAL_AUTH_METHODS)[number];

export const PORTAL_SESSION_STATUSES = ["pending", "active", "expired", "revoked"] as const;
export type PortalSessionStatus = (typeof PORTAL_SESSION_STATUSES)[number];

export const PORTAL_APPOINTMENT_FILTERS = [
  "upcoming",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type PortalAppointmentFilter = (typeof PORTAL_APPOINTMENT_FILTERS)[number];

export const PORTAL_PAYMENT_PROVIDERS = ["stripe", "paymob", "fawry", "sandbox", "manual"] as const;
export type PortalPaymentProviderCode = (typeof PORTAL_PAYMENT_PROVIDERS)[number];

export const PORTAL_DOCUMENT_TYPES = [
  "invoice",
  "receipt",
  "medical",
  "attachment",
] as const;
export type PortalDocumentType = (typeof PORTAL_DOCUMENT_TYPES)[number];

export const PORTAL_BOOKING_STEPS = [
  "service",
  "doctor",
  "date",
  "time",
  "customer",
  "review",
  "confirm",
] as const;
export type PortalBookingStep = (typeof PORTAL_BOOKING_STEPS)[number];
