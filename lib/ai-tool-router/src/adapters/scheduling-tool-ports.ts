import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BookingDomainServicePort,
  CreateBookingInput,
  CreateBookingResult,
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

function addDaysIso(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function todayIso(referenceNow: Date): string {
  return referenceNow.toISOString().slice(0, 10);
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
    .select("id, name, metadata")
    .eq("company_id", companyId)
    .in("id", resourceIds)
    .eq("status", "active")
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  return new Map(
    (data ?? []).map((row) => [
      String(row.id),
      {
        id: String(row.id),
        name: String(row.name),
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      },
    ]),
  );
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

async function loadMaxBookingWindowDays(client: SupabaseClient, companyId: string): Promise<number> {
  const { data, error } = await client
    .from("scheduling_booking_rules")
    .select("max_booking_window_days")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Number(data?.max_booking_window_days ?? 90);
}

async function loadSlotsForDate(
  engines: SchedulingEnginePort,
  companyId: string,
  resourceId: string,
  serviceId: string,
  date: string,
  referenceNow: Date,
): Promise<ResolvedSlotsPort> {
  return engines.getAvailableSlots(companyId, resourceId, serviceId, date, {
    respectBookingRules: true,
    referenceNow,
  });
}

export async function executeSearchAvailability(
  client: SupabaseClient,
  engines: SchedulingEnginePort,
  input: SearchAvailabilityInput,
): Promise<SearchAvailabilityResult> {
  const referenceNow = new Date();
  const durationMinutes = await loadServiceDuration(client, input.companyId, input.serviceId);
  const maxWindowDays = await loadMaxBookingWindowDays(client, input.companyId);

  let resourceIds = input.resourceId
    ? [input.resourceId]
    : await listResourceIdsForService(client, input.companyId, input.serviceId, input.branchId);

  resourceIds = [...new Set(resourceIds)];
  if (resourceIds.length === 0) {
    return {
      success: true,
      serviceId: input.serviceId,
      durationMinutes,
      availableDates: [],
      resources: [],
      message: "No eligible resources found for this service.",
    };
  }

  const resourceMap = await loadResources(client, input.companyId, resourceIds);
  const scanDays = Math.min(Math.max(input.daysAhead ?? 14, 1), maxWindowDays);
  const startDate = input.date ?? todayIso(referenceNow);

  const datesToScan: string[] = input.date
    ? [input.date]
    : Array.from({ length: scanDays }, (_, index) => addDaysIso(startDate, index));

  const availableDatesSet = new Set<string>();
  const resources: SearchAvailabilityResult["resources"] = [];

  for (const resourceId of resourceIds) {
    const resource = resourceMap.get(resourceId);
    if (!resource) continue;

    const capacity = readCapacity(resource.metadata);
    const resourceAvailableDates: string[] = [];
    const slots: SearchAvailabilityResult["resources"][number]["slots"] = [];

    for (const date of datesToScan) {
      const availability = await engines.resolveAvailability(
        input.companyId,
        resourceId,
        input.serviceId,
        date,
        { respectBookingRules: true, referenceNow },
      );

      if (!availability.available) continue;

      const resolved = await loadSlotsForDate(
        engines,
        input.companyId,
        resourceId,
        input.serviceId,
        date,
        referenceNow,
      );

      if (!resolved.available || resolved.generatedSlots.length === 0) continue;

      resourceAvailableDates.push(date);
      availableDatesSet.add(date);

      for (const generated of resolved.generatedSlots) {
        slots.push({ date, start: generated.start, end: generated.end });
      }
    }

    resources.push({
      resourceId,
      resourceName: resource.name,
      durationMinutes,
      capacity,
      availableDates: resourceAvailableDates,
      slots,
    });
  }

  return {
    success: true,
    serviceId: input.serviceId,
    durationMinutes,
    availableDates: [...availableDatesSet].sort(),
    resources,
  };
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
      return {
        success: false,
        errors: error.codes,
        message: error.codes.join(", "),
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
    createBooking(input) {
      if (!bookingDomain) {
        throw new Error("Booking domain service is not configured for scheduling tools.");
      }
      return executeCreateBooking(bookingDomain, input);
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
