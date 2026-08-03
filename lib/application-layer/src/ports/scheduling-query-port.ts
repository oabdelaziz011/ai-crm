/** Read-only scheduling intelligence — infrastructure adapters implement this; AI never calls engines directly. */

export type AvailabilitySlot = Readonly<{ start: string; end: string }>;

export type SearchAvailabilityResourceResult = Readonly<{
  resourceId: string;
  resourceName: string;
  durationMinutes: number;
  capacity: number;
  availableDates: readonly string[];
  slots: readonly (AvailabilitySlot & { date: string })[];
}>;

export type SearchAvailabilityQuery = Readonly<{
  tenantId: string;
  actorUserId: string;
  serviceId: string;
  resourceId?: string;
  branchId?: string;
  date?: string;
  daysAhead?: number;
}>;

export type SearchAvailabilityResult = Readonly<{
  success: boolean;
  serviceId: string;
  durationMinutes: number;
  availableDates: readonly string[];
  resources: readonly SearchAvailabilityResourceResult[];
  message?: string;
  searchedWindow?: number;
  nextSuggestion?: number | null;
}>;

export type FindNextAvailableQuery = Readonly<{
  tenantId: string;
  actorUserId: string;
  serviceId: string;
  resourceId?: string;
  branchId?: string;
  daysAhead?: number;
}>;

export type FindNextAvailableSlotResult = Readonly<{
  date: string;
  start: string;
  end: string;
  resourceId: string;
  resourceName: string;
  serviceId: string;
  durationMinutes: number;
  capacity: number;
  timezone: string;
}>;

export type FindNextAvailableResult = Readonly<{
  success: boolean;
  searchedWindow: number;
  nextSuggestion?: number | null;
  message?: string;
  slot: FindNextAvailableSlotResult | null;
}>;

export type RecommendAppointmentQuery = Readonly<{
  tenantId: string;
  actorUserId: string;
  serviceId: string;
  preferredResourceId?: string;
  preferredBranchId?: string;
  preferredDate?: string;
  preferredTime?: string;
  daysAhead?: number;
}>;

export type RecommendAppointmentResult = Readonly<{
  success: boolean;
  searchedWindow: number;
  recommendations: readonly Record<string, unknown>[];
  alternativeResource: Record<string, unknown> | null;
  alternativeBranch: Record<string, unknown> | null;
  nearestDate: Record<string, unknown> | null;
  message?: string;
  nextSuggestion?: number | null;
}>;

export type SchedulingQueryPort = {
  searchAvailability(input: SearchAvailabilityQuery): Promise<SearchAvailabilityResult>;
  findNextAvailable(input: FindNextAvailableQuery): Promise<FindNextAvailableResult>;
  recommendAppointment(input: RecommendAppointmentQuery): Promise<RecommendAppointmentResult>;
};
