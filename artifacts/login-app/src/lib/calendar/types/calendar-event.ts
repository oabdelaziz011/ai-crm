import type {
  SchedulingBookingSource,
  SchedulingBookingStatus,
} from "@/lib/scheduling/booking-domain";

export type CalendarEventIcon =
  | "source-crm"
  | "source-whatsapp"
  | "source-ai"
  | "source-public"
  | "source-call-center"
  | "source-api"
  | "notes";

export type CalendarEventColor = {
  bgClass: string;
  borderClass: string;
  textClass: string;
  accentClass: string;
};

export type CalendarEventExtensions = {
  legacy?: boolean;
  aiSuggested?: boolean;
  externalSync?: { provider: "google" | "outlook"; externalId: string };
  recurrenceRuleId?: string;
  channelMetadata?: Record<string, unknown>;
};

/** Canonical calendar event — all views consume this model. */
export type CalendarEvent = {
  id: string;
  companyId: string;
  version: number;

  startAt: string;
  endAt: string;
  timezone: string;
  displayStart: string;
  displayEnd: string;
  displayDate: string;
  durationMinutes: number;

  title: string;
  subtitle: string;
  status: SchedulingBookingStatus;
  source: SchedulingBookingSource;
  color: CalendarEventColor;

  customer: { id: string; name: string } | null;
  service: { id: string; name: string; durationMinutes: number } | null;
  resource: { id: string; name: string; type: string } | null;
  branch: { id: string; name: string } | null;

  icons: CalendarEventIcon[];
  isDraggable: boolean;
  isResizable: boolean;
  permissions: {
    canEdit: boolean;
    canCancel: boolean;
    canComplete: boolean;
  };

  extensions: CalendarEventExtensions;
};

/** Repository DTO — joined scheduling_bookings row. */
export type CalendarEventRecord = {
  id: string;
  company_id: string;
  branch_id: string | null;
  customer_id: string;
  resource_id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  timezone: string;
  status: SchedulingBookingStatus;
  source: SchedulingBookingSource;
  notes: string | null;
  version: number;
  created_by: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  visit_type?: string | null;
  payment_status?: string | null;
  discount_cents?: number | null;
  tax_cents?: number | null;
  invoice_id?: string | null;
  confirmation_number?: string | null;
  customers?: { id: string; name: string } | null;
  scheduling_services?: {
    id: string;
    name: string;
    duration_minutes: number;
    price_cents?: number | null;
    currency?: string | null;
  } | null;
  scheduling_resources?: {
    id: string;
    name: string;
    resource_type: string;
  } | null;
  branches?: { id: string; name: string } | null;
};

export type CalendarEventsByDay = Map<string, CalendarEvent[]>;

export type CalendarEventsByResource = Map<string, CalendarEvent[]>;
