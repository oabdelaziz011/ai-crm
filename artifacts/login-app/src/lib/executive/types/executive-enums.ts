export type AlertSeverity = "info" | "warning" | "critical";

export type AlertStatus = "active" | "dismissed" | "resolved";

export type AlertType =
  | "revenue_dropped"
  | "bookings_below_target"
  | "high_cancellation"
  | "high_no_show"
  | "long_waiting_time"
  | "payment_failures"
  | "communication_failures"
  | "doctor_overload"
  | "branch_overload"
  | "outstanding_invoices";

export type ForecastHorizon = 7 | 30 | 90;

export type ForecastType = "revenue" | "bookings" | "occupancy" | "demand" | "cash_flow";

export type ReportPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

export type ReportKind =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "doctor"
  | "branch"
  | "financial"
  | "communication"
  | "customer";

export type ExecutiveRole = "owner" | "executive" | "regional_manager" | "branch_manager";

export type TrendDirection = "up" | "down" | "flat";

export type TimelineEventType =
  | "booking"
  | "payment"
  | "refund"
  | "invoice"
  | "alert"
  | "major_event";
