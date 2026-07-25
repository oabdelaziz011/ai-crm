import type {
  AvailabilityException,
  Branch,
  ResourceBreak,
  ResourceWeeklyHours,
  SchedulingBookingRules,
  SchedulingHoliday,
  SchedulingResource,
  SchedulingService,
  WeekdayIndex,
} from "@/lib/scheduling/types";
import type { AvailabilityResolveOptions } from "@/lib/scheduling/availability-engine/types";

/** Snapshot passed to the pure resolver — no I/O. */
export type AvailabilityContextSnapshot = {
  resourceId: string;
  resource: SchedulingResource | null;
  service: SchedulingService | null;
  branch: Branch | null;
  weeklyHours: ResourceWeeklyHours[];
  breaks: ResourceBreak[];
  exceptions: AvailabilityException[];
  holidays: SchedulingHoliday[];
  bookingRules: SchedulingBookingRules | null;
  serviceCapabilityIds: string[];
  date: string;
  serviceId: string | null;
  options: AvailabilityResolveOptions;
};

export type PolicyEvaluation = {
  blocked: boolean;
  reasons: import("@/lib/scheduling/availability-engine/types").AvailabilityUnavailabilityReason[];
  timezone: string;
  weekday: WeekdayIndex | null;
};
