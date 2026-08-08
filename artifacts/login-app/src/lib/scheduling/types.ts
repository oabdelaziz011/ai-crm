/** Enterprise scheduling domain types — configuration only (S4.1). */

export const SCHEDULING_RESOURCE_TYPES = [
  "doctor",
  "employee",
  "therapist",
  "room",
  "chair",
  "equipment",
  "other",
] as const;

export type SchedulingResourceType = (typeof SCHEDULING_RESOURCE_TYPES)[number];

export const SCHEDULING_RESOURCE_STATUSES = ["active", "inactive", "archived"] as const;
export type SchedulingResourceStatus = (typeof SCHEDULING_RESOURCE_STATUSES)[number];

export const SCHEDULING_EXCEPTION_TYPES = [
  "vacation",
  "training",
  "conference",
  "unavailable",
  "custom",
] as const;

export type SchedulingExceptionType = (typeof SCHEDULING_EXCEPTION_TYPES)[number];

export const WEEKDAY_INDICES = [0, 1, 2, 3, 4, 5, 6] as const;
export type WeekdayIndex = (typeof WEEKDAY_INDICES)[number];

export type BranchStatus = "active" | "inactive" | "archived";

export type Branch = {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  timezone: string;
  status: BranchStatus;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  manager_user_id: string | null;
  settings?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
};

export type SchedulingResource = {
  id: string;
  company_id: string;
  branch_id: string | null;
  name: string;
  resource_type: SchedulingResourceType;
  status: SchedulingResourceStatus;
  timezone: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  branches?: Pick<Branch, "id" | "name"> | null;
};

export type ResourceWeeklyHours = {
  id: string;
  company_id: string;
  resource_id: string;
  day_of_week: WeekdayIndex;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ResourceBreak = {
  id: string;
  company_id: string;
  weekly_hours_id: string;
  resource_id: string;
  starts_at: string;
  ends_at: string;
  label: string | null;
  created_at: string;
  updated_at: string;
};

export type AvailabilityException = {
  id: string;
  company_id: string;
  resource_id: string;
  exception_type: SchedulingExceptionType;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
};

export type SchedulingBookingRules = {
  id: string;
  company_id: string;
  min_booking_notice_minutes: number;
  max_booking_window_days: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  slot_interval_minutes: number;
  min_cancellation_notice_minutes: number;
  min_reschedule_notice_minutes: number;
  allow_overbooking: boolean;
  timezone: string;
  week_start_day: WeekdayIndex;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type SchedulingHoliday = {
  id: string;
  company_id: string;
  branch_id: string | null;
  holiday_date: string;
  title: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  branches?: Pick<Branch, "id" | "name"> | null;
};

/** Full availability configuration for one resource (no computed slots). */
export type ResourceAvailabilityConfig = {
  resourceId: string;
  weeklyHours: ResourceWeeklyHours[];
  breaks: ResourceBreak[];
  exceptions: AvailabilityException[];
};

export type ResourceInsert = {
  company_id: string;
  branch_id?: string | null;
  name: string;
  resource_type: SchedulingResourceType;
  status?: SchedulingResourceStatus;
  timezone: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  created_by?: string | null;
  updated_by?: string | null;
};

export type ResourceUpdate = Partial<
  Omit<ResourceInsert, "company_id" | "created_by">
>;

export type WeeklyHoursUpsert = {
  day_of_week: WeekdayIndex;
  is_closed: boolean;
  opens_at?: string | null;
  closes_at?: string | null;
  breaks?: Array<{
    id?: string;
    starts_at: string;
    ends_at: string;
    label?: string | null;
  }>;
};

export type ExceptionInsert = {
  company_id: string;
  resource_id: string;
  exception_type: SchedulingExceptionType;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day?: boolean;
  notes?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
};

export type ExceptionUpdate = Partial<
  Omit<ExceptionInsert, "company_id" | "resource_id" | "created_by">
>;

export type BookingRulesUpsert = {
  company_id: string;
  min_booking_notice_minutes: number;
  max_booking_window_days: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  slot_interval_minutes: number;
  min_cancellation_notice_minutes: number;
  min_reschedule_notice_minutes: number;
  allow_overbooking: boolean;
  timezone: string;
  week_start_day: WeekdayIndex;
  created_by?: string | null;
  updated_by?: string | null;
};

export type HolidayInsert = {
  company_id: string;
  branch_id?: string | null;
  holiday_date: string;
  title: string;
  created_by?: string | null;
  updated_by?: string | null;
};

export type HolidayUpdate = Partial<Omit<HolidayInsert, "company_id">>;

export const DEFAULT_BOOKING_RULES: Omit<
  BookingRulesUpsert,
  "company_id" | "created_by" | "updated_by"
> = {
  min_booking_notice_minutes: 60,
  max_booking_window_days: 90,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  slot_interval_minutes: 15,
  min_cancellation_notice_minutes: 0,
  min_reschedule_notice_minutes: 0,
  allow_overbooking: false,
  timezone: "UTC",
  week_start_day: 1,
};

export const DEFAULT_WEEKLY_HOURS: WeeklyHoursUpsert[] = WEEKDAY_INDICES.map((day) => ({
  day_of_week: day,
  is_closed: day === 0 || day === 6,
  opens_at: day === 0 || day === 6 ? null : "09:00",
  closes_at: day === 0 || day === 6 ? null : "17:00",
  breaks:
    day === 0 || day === 6
      ? []
      : [{ starts_at: "13:00", ends_at: "14:00", label: null }],
}));

export const SCHEDULING_SERVICE_STATUSES = ["active", "inactive", "archived"] as const;
export type SchedulingServiceStatus = (typeof SCHEDULING_SERVICE_STATUSES)[number];

export type SchedulingService = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  category?: string | null;
  duration_minutes: number;
  price_cents: number;
  currency: string;
  status: SchedulingServiceStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
};

/** Supported pricing currencies + company-default sentinel. */
export const SERVICE_PRICING_CURRENCIES = ["EGP", "SAR", "AED", "USD", "EUR"] as const;
export type ServicePricingCurrency = (typeof SERVICE_PRICING_CURRENCIES)[number];
/** Sentinel meaning "use company default currency" in the UI. */
export const COMPANY_DEFAULT_CURRENCY = "__COMPANY_DEFAULT__" as const;

export type SchedulingPricingRuleType = {
  id: string;
  company_id: string;
  code: string;
  label: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type SchedulingServicePricingRule = {
  id: string;
  company_id: string;
  service_id: string;
  type_id: string;
  price_cents: number;
  currency: string;
  duration_minutes: number;
  is_default: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  /** Joined type catalog row when selected. */
  type?: Pick<SchedulingPricingRuleType, "id" | "code" | "label"> | null;
};

export type ServiceInsert = {
  company_id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  duration_minutes?: number;
  price_cents?: number;
  currency?: string;
  status?: SchedulingServiceStatus;
  created_by?: string | null;
  updated_by?: string | null;
};

export type ServiceUpdate = Partial<Omit<ServiceInsert, "company_id" | "created_by">>;

export type ResourceServiceMapping = {
  id: string;
  company_id: string;
  resource_id: string;
  service_id: string;
  created_at: string;
  created_by: string | null;
  deleted_at: string | null;
};

export type ResourceServiceLink = ResourceServiceMapping & {
  scheduling_services?: Pick<SchedulingService, "id" | "name" | "duration_minutes" | "status">;
  scheduling_resources?: Pick<SchedulingResource, "id" | "name" | "resource_type" | "status">;
};

/** Query result: eligible resources for a service (availability engine input). */
export type EligibleResourceRef = Pick<
  SchedulingResource,
  "id" | "name" | "resource_type" | "status" | "timezone" | "branch_id"
>;

/** Query result: services a resource can perform. */
export type ResourceCapabilityRef = Pick<
  SchedulingService,
  "id" | "name" | "duration_minutes" | "status"
>;

