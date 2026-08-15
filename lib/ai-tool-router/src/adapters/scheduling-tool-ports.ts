import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildEmptyAvailabilityResult,
  getNextAvailableSlot,
  normalizeDaysAhead,
  recommendAppointments,
  scanAvailableDates,
  TimezoneResolver,
  type AvailabilityScanEnginePort,
  type NextAvailableSlot,
  type RecommendationBranchContext,
  type RecommendationResourceContext,
} from "@workspace/scheduling-engine";
import type {
  BookingDomainServicePort,
  CreateBookingInput,
  CreateBookingResult,
  FindNextAvailableInput,
  FindNextAvailableResult,
  RecommendAppointmentInput,
  RecommendAppointmentResult,
  SearchAvailabilityInput,
  SearchAvailabilityResult,
  SchedulingToolPorts,
} from "../tools/scheduling-agent-ports.js";

export type ResolvedSlotsPort = {
  available: boolean;
  date: string;
  timezone: string;
  resourceId: string;
  serviceId: string;
  durationMinutes: number;
  slots: string[];
  generatedSlots: Array<{ start: string; end: string }>;
};

export type ResolvedAvailabilityPort = {
  available: boolean;
  date: string;
  resourceId: string;
  serviceId: string | null;
};

export type SchedulingEnginePort = {
  getAvailableSlots(
    companyId: string,
    resourceId: string,
    serviceId: string,
    date: string,
    options?: { respectBookingRules?: boolean; referenceNow?: Date },
  ): Promise<ResolvedSlotsPort>;
  getAvailableSlotsBatch(
    companyId: string,
    resourceIds: string[],
    serviceId: string,
    date: string,
    options?: { respectBookingRules?: boolean; referenceNow?: Date },
  ): Promise<ResolvedSlotsPort[]>;
  resolveAvailability(
    companyId: string,
    resourceId: string,
    serviceId: string,
    date: string,
    options?: { respectBookingRules?: boolean; referenceNow?: Date },
  ): Promise<ResolvedAvailabilityPort>;
};

type ResourceRow = {
  id: string;
  name: string;
  branchId: string | null;
  branchName: string | null;
  metadata: Record<string, unknown> | null;
};

function readCapacity(metadata: Record<string, unknown> | null | undefined): number {
  const raw = metadata?.capacity;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  if (typeof raw === "string") {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 1;
}

async function loadBookingRules(
  client: SupabaseClient,
  companyId: string,
): Promise<{ maxBookingWindowDays: number; timezone: string }> {
  const { data, error } = await client
    .from("scheduling_booking_rules")
    .select("max_booking_window_days, timezone")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return {
    maxBookingWindowDays: Number(data?.max_booking_window_days ?? 90),
    timezone: String(data?.timezone ?? "UTC"),
  };
}

async function listResourceIdsForService(
  client: SupabaseClient,
  companyId: string,
  serviceId: string,
  branchId?: string,
): Promise<string[]> {
  let query = client
    .from("resource_services")
    .select("resource_id, scheduling_resources!inner(id, status, branch_id, deleted_at)")
    .eq("company_id", companyId)
    .eq("service_id", serviceId)
    .is("deleted_at", null);

  if (branchId) {
    query = query.eq("scheduling_resources.branch_id", branchId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => {
      const resource = row.scheduling_resources as { status?: string; deleted_at?: string | null } | null;
      return resource?.status === "active" && !resource?.deleted_at;
    })
    .map((row) => String(row.resource_id));
}

async function loadResources(
  client: SupabaseClient,
  companyId: string,
  resourceIds: string[],
): Promise<Map<string, ResourceRow>> {
  if (resourceIds.length === 0) return new Map();

  const { data, error } = await client
    .from("scheduling_resources")
    .select("id, name, metadata, branch_id, branches(id, name)")
    .eq("company_id", companyId)
    .in("id", resourceIds)
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  return new Map(
    (data ?? []).map((row) => {
      const branch = row.branches as { id?: string; name?: string } | null;
      return [
        String(row.id),
        {
          id: String(row.id),
          name: String(row.name),
          branchId: row.branch_id ? String(row.branch_id) : null,
          branchName: branch?.name ? String(branch.name) : null,
          metadata: (row.metadata as Record<string, unknown> | null) ?? null,
        },
      ];
    }),
  );
}

async function loadBranches(
  client: SupabaseClient,
  companyId: string,
): Promise<RecommendationBranchContext[]> {
  const { data, error } = await client
    .from("branches")
    .select("id, name, is_primary")
    .eq("company_id", companyId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row, index) => ({
    branchId: String(row.id),
    branchName: String(row.name),
    isPrimary: Boolean(row.is_primary),
    priority: row.is_primary ? 100 : Math.max(0, 50 - index),
  }));
}

async function loadServiceDuration(
  client: SupabaseClient,
  companyId: string,
  serviceId: string,
): Promise<number> {
  const { data, error } = await client
    .from("scheduling_services")
    .select("duration_minutes")
    .eq("company_id", companyId)
    .eq("id", serviceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Service not found for this company.");
  return Number(data.duration_minutes ?? 30);
}

function createAvailabilityScanEnginePort(engines: SchedulingEnginePort): AvailabilityScanEnginePort {
  return {
    resolveAvailability: (...args) => engines.resolveAvailability(...args),
    getAvailableSlots: (...args) => engines.getAvailableSlots(...args),
  };
}

function mapNextAvailableResult(
  next: NextAvailableSlot | null,
  searchedWindow: number,
): FindNextAvailableResult {
  if (!next) {
    const empty = buildEmptyAvailabilityResult(searchedWindow);
    return {
      success: false,
      searchedWindow: empty.searchedWindow,
      nextSuggestion: empty.nextSuggestion,
      message: `No bookable appointments were found during the next ${empty.searchedWindow} days.`,
      slot: null,
    };
  }

  return {
    success: true,
    searchedWindow,
    slot: {
      date: next.date,
      start: next.slot.start,
      end: next.slot.end,
      resourceId: next.resource.id,
      resourceName: next.resource.name,
      serviceId: next.service.id,
      durationMinutes: next.service.durationMinutes,
      capacity: next.resource.capacity,
      timezone: next.timezone,
    },
  };
}

async function resolveSchedulingContext(
  client: SupabaseClient,
  input: {
    companyId: string;
    serviceId: string;
    resourceId?: string;
    branchId?: string;
  },
) {
  const durationMinutes = await loadServiceDuration(client, input.companyId, input.serviceId);
  const bookingRules = await loadBookingRules(client, input.companyId);
  const timezone = TimezoneResolver.resolveEffectiveTimezone(null, null, bookingRules.timezone);
  const referenceNow = new Date();
  const startDate = TimezoneResolver.localDateForInstant(referenceNow, timezone);

  let resourceIds = input.resourceId
    ? [input.resourceId]
    : await listResourceIdsForService(client, input.companyId, input.serviceId, input.branchId);

  resourceIds = [...new Set(resourceIds)];
  const resourceMap = await loadResources(client, input.companyId, resourceIds);
  const resources = resourceIds.flatMap((resourceId) => {
    const resource = resourceMap.get(resourceId);
    if (!resource) return [];
    return [{
      resourceId,
      resourceName: resource.name,
      capacity: readCapacity(resource.metadata),
    }];
  });

  return {
    durationMinutes,
    bookingRules,
    timezone,
    referenceNow,
    startDate,
    resources,
  };
}

export async function executeSearchAvailability(
  client: SupabaseClient,
  engines: SchedulingEnginePort,
  input: SearchAvailabilityInput,
): Promise<SearchAvailabilityResult> {
  const context = await resolveSchedulingContext(client, input);
  const scanEngine = createAvailabilityScanEnginePort(engines);

  if (context.resources.length === 0) {
    return {
      success: true,
      serviceId: input.serviceId,
      durationMinutes: context.durationMinutes,
      availableDates: [],
      resources: [],
      message: "No eligible resources found for this service.",
    };
  }

  const scanResult = await scanAvailableDates(scanEngine, {
    companyId: input.companyId,
    serviceId: input.serviceId,
    durationMinutes: context.durationMinutes,
    resources: context.resources,
    startDate: context.startDate,
    daysAhead: input.daysAhead,
    timezone: context.timezone,
    maxBookingWindowDays: context.bookingRules.maxBookingWindowDays,
    singleDate: input.date,
    referenceNow: context.referenceNow,
  });

  const hasAvailability = scanResult.availableDates.length > 0;

  return {
    success: hasAvailability,
    serviceId: input.serviceId,
    durationMinutes: context.durationMinutes,
    availableDates: scanResult.availableDates,
    resources: scanResult.resources,
    searchedWindow: scanResult.searchedWindow,
    ...(scanResult.emptyResult ?? {}),
    ...(hasAvailability ? {} : {
      message: scanResult.emptyResult?.message ?? `No appointments are available during the next ${scanResult.searchedWindow} days.`,
      nextSuggestion: scanResult.emptyResult?.nextSuggestion ?? null,
    }),
  };
}

export async function executeFindNextAvailable(
  client: SupabaseClient,
  engines: SchedulingEnginePort,
  input: FindNextAvailableInput,
): Promise<FindNextAvailableResult> {
  const context = await resolveSchedulingContext(client, input);
  const scanEngine = createAvailabilityScanEnginePort(engines);

  if (context.resources.length === 0) {
    return {
      success: false,
      searchedWindow: input.daysAhead ?? 7,
      nextSuggestion: 14,
      message: "No eligible resources found for this service.",
      slot: null,
    };
  }

  const searchedWindow = normalizeDaysAhead(
    input.daysAhead,
    context.bookingRules.maxBookingWindowDays,
  );
  const next = await getNextAvailableSlot(scanEngine, {
    companyId: input.companyId,
    serviceId: input.serviceId,
    durationMinutes: context.durationMinutes,
    resources: context.resources,
    startDate: context.startDate,
    daysAhead: input.daysAhead,
    timezone: context.timezone,
    maxBookingWindowDays: context.bookingRules.maxBookingWindowDays,
    referenceNow: context.referenceNow,
  });

  return mapNextAvailableResult(next, searchedWindow);
}

async function resolveRecommendationContext(
  client: SupabaseClient,
  input: {
    companyId: string;
    serviceId: string;
  },
) {
  const durationMinutes = await loadServiceDuration(client, input.companyId, input.serviceId);
  const bookingRules = await loadBookingRules(client, input.companyId);
  const timezone = TimezoneResolver.resolveEffectiveTimezone(null, null, bookingRules.timezone);
  const referenceNow = new Date();
  const startDate = TimezoneResolver.localDateForInstant(referenceNow, timezone);
  const resourceIds = [...new Set(await listResourceIdsForService(client, input.companyId, input.serviceId))];
  const resourceMap = await loadResources(client, input.companyId, resourceIds);
  const branches = await loadBranches(client, input.companyId);

  const resources: RecommendationResourceContext[] = resourceIds.flatMap((resourceId) => {
    const resource = resourceMap.get(resourceId);
    if (!resource) return [];
    return [{
      resourceId,
      resourceName: resource.name,
      branchId: resource.branchId,
      branchName: resource.branchName,
      capacity: readCapacity(resource.metadata),
    }];
  });

  return {
    durationMinutes,
    bookingRules,
    timezone,
    referenceNow,
    startDate,
    resources,
    branches,
  };
}

export async function executeRecommendAppointment(
  client: SupabaseClient,
  engines: SchedulingEnginePort,
  input: RecommendAppointmentInput,
): Promise<RecommendAppointmentResult> {
  const context = await resolveRecommendationContext(client, input);
  const scanEngine = createAvailabilityScanEnginePort(engines);

  if (context.resources.length === 0) {
    return {
      success: false,
      searchedWindow: input.daysAhead ?? 7,
      recommendations: [],
      alternativeResource: null,
      alternativeBranch: null,
      nearestDate: null,
      message: "No eligible resources found for this service.",
    };
  }

  return recommendAppointments(scanEngine, {
    companyId: input.companyId,
    serviceId: input.serviceId,
    durationMinutes: context.durationMinutes,
    resources: context.resources,
    branches: context.branches,
    startDate: context.startDate,
    daysAhead: input.daysAhead,
    timezone: context.timezone,
    maxBookingWindowDays: context.bookingRules.maxBookingWindowDays,
    referenceNow: context.referenceNow,
    preferences: {
      resourceId: input.preferredResourceId,
      branchId: input.preferredBranchId,
      date: input.preferredDate,
      time: input.preferredTime,
    },
    limit: 3,
  });
}

function isBookingDomainError(error: unknown): error is { codes: string[]; name: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "BookingDomainError" &&
    Array.isArray((error as { codes?: unknown }).codes)
  );
}

export async function executeCreateBooking(
  bookingDomain: BookingDomainServicePort,
  input: CreateBookingInput,
): Promise<CreateBookingResult> {
  try {
    const result = await bookingDomain.createBooking({
      companyId: input.companyId,
      customerId: input.customerId,
      resourceId: input.resourceId,
      serviceId: input.serviceId,
      date: input.date,
      slotStart: input.slotStart,
      source: "ai_assistant",
      notes: input.notes ?? null,
      createdBy: input.userId,
      branchId: input.branchId ?? null,
    });

    return {
      success: true,
      bookingId: result.booking.id,
      status: result.booking.status,
      startAt: result.booking.start_at,
      endAt: result.booking.end_at,
    };
  } catch (error) {
    if (isBookingDomainError(error)) {
      const codes = error.codes;
      const message = codes.includes("booking_conflict") || codes.includes("slot_unavailable")
        ? "This time slot is already booked or unavailable. Offer another available slot — do not confirm a booking."
        : codes.join(", ");
      return {
        success: false,
        errors: codes,
        message,
        customerFacingMessage: codes.includes("booking_conflict") || codes.includes("slot_unavailable")
          ? "الموعد ده محجوز أو غير متاح. اختار معاد تاني."
          : "ما قدرناش نكمّل الحجز. جرّب معاد أو بيانات تانية.",
      };
    }
    throw error;
  }
}

export function createSchedulingToolPorts(
  client: SupabaseClient,
  engines: SchedulingEnginePort,
  bookingDomain?: BookingDomainServicePort,
): SchedulingToolPorts {
  return {
    searchAvailability(input) {
      return executeSearchAvailability(client, engines, input);
    },
    findNextAvailable(input) {
      return executeFindNextAvailable(client, engines, input);
    },
    recommendAppointment(input) {
      return executeRecommendAppointment(client, engines, input);
    },
    createBooking(input) {
      if (!bookingDomain) {
        throw new Error("Booking domain service is not configured for scheduling tools.");
      }
      return executeCreateBooking(bookingDomain, input);
    },
    searchBookings() {
      throw new Error("searchBookings requires Application Layer scheduling ports.");
    },
    rescheduleBooking() {
      throw new Error("rescheduleBooking requires Application Layer scheduling ports.");
    },
    cancelBooking() {
      throw new Error("cancelBooking requires Application Layer scheduling ports.");
    },
    checkInBooking() {
      throw new Error("checkInBooking requires Application Layer scheduling ports.");
    },
    checkOutBooking() {
      throw new Error("checkOutBooking requires Application Layer scheduling ports.");
    },
  };
}

export function createSchedulingEnginePortFromAdapters(adapters: {
  slotGenerationEngine: {
    getAvailableSlots: SchedulingEnginePort["getAvailableSlots"];
    getAvailableSlotsBatch: SchedulingEnginePort["getAvailableSlotsBatch"];
  };
  availabilityEngine: {
    resolveAvailability: SchedulingEnginePort["resolveAvailability"];
  };
}): SchedulingEnginePort {
  return {
    getAvailableSlots: (...args) => adapters.slotGenerationEngine.getAvailableSlots(...args),
    getAvailableSlotsBatch: (...args) => adapters.slotGenerationEngine.getAvailableSlotsBatch(...args),
    resolveAvailability: (...args) => adapters.availabilityEngine.resolveAvailability(...args),
  };
}
