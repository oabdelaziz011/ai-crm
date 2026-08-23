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
import { buildAvailabilityCustomerSummary } from "../utils/scheduling-customer-display.js";
import type {
  BookingDomainServicePort,
  CancelBookingInput,
  CancelBookingResult,
  CheckInBookingInput,
  CheckInBookingResult,
  CheckOutBookingInput,
  CheckOutBookingResult,
  CreateBookingInput,
  CreateBookingResult,
  FindNextAvailableInput,
  FindNextAvailableResult,
  RecommendAppointmentInput,
  RecommendAppointmentResult,
  RescheduleBookingInput,
  RescheduleBookingResult,
  SearchAvailabilityInput,
  SearchAvailabilityResult,
  SearchBookingsInput,
  SearchBookingsResult,
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

type IdSuggestion = Readonly<{ id: string; name: string }>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

function formatIdSuggestions(suggestions: readonly IdSuggestion[]): string {
  if (suggestions.length === 0) return "none configured";
  return suggestions.map((item) => `${item.name} (${item.id})`).join("; ");
}

function normalizeLookupToken(value: string): string {
  return value
    .trim()
    .replace(/[%_]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function listActiveServices(
  client: SupabaseClient,
  companyId: string,
  limit = 20,
): Promise<IdSuggestion[]> {
  try {
    const { data, error } = await client
      .from("scheduling_services")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name")
      .limit(limit);

    if (error) return [];
    return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
  } catch {
    return [];
  }
}

function looksLikeLegacySlug(value: string): boolean {
  // Test fixtures only — avoid treating LLM guesses like "doctor-appointment" as IDs.
  return /^(service|resource)-[a-z0-9-]+$/i.test(value.trim());
}

async function resolveServiceIdentifier(
  client: SupabaseClient,
  companyId: string,
  raw: string,
): Promise<{ serviceId: string } | { error: string; suggestions: IdSuggestion[] }> {
  const trimmed = raw.trim();
  if (!trimmed) {
    const suggestions = await listActiveServices(client, companyId);
    return { error: "serviceId is required.", suggestions };
  }
  if (isUuid(trimmed) || looksLikeLegacySlug(trimmed)) return { serviceId: trimmed };

  const lookup = normalizeLookupToken(trimmed).toLowerCase();
  const services = await listActiveServices(client, companyId, 100);
  const exact = services.filter((service) => service.name.toLowerCase() === lookup);
  if (exact.length === 1) return { serviceId: exact[0].id };

  const partial = services.filter((service) => {
    const name = service.name.toLowerCase();
    return name.includes(lookup) || lookup.includes(name);
  });
  if (partial.length === 1) return { serviceId: partial[0].id };

  const suggestions = partial.length > 0 ? partial : services;
  const catalog = formatIdSuggestions(suggestions);
  if (partial.length > 1) {
    return {
      error: `Multiple services match "${trimmed}". Pick the exact serviceId from: ${catalog}`,
      suggestions,
    };
  }
  return {
    error: `Unknown service "${trimmed}". Use a scheduling service UUID from: ${catalog}`,
    suggestions,
  };
}

async function resolveResourceIdentifier(
  client: SupabaseClient,
  companyId: string,
  raw: string,
  serviceId: string,
): Promise<{ resourceId: string } | { error: string; suggestions: IdSuggestion[] }> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: "resourceId is required.", suggestions: [] };
  }
  if (isUuid(trimmed) || looksLikeLegacySlug(trimmed)) return { resourceId: trimmed };

  const eligibleIds = await listResourceIdsForService(client, companyId, serviceId);
  const resourceMap = await loadResources(client, companyId, eligibleIds);
  const lookup = normalizeLookupToken(trimmed).toLowerCase();

  const matches = [...resourceMap.values()].filter((resource) => {
    const name = resource.name.toLowerCase();
    return name.includes(lookup) || lookup.includes(name);
  });

  if (matches.length === 1) return { resourceId: matches[0].id };

  const suggestions = (matches.length > 0 ? matches : [...resourceMap.values()]).map((resource) => ({
    id: resource.id,
    name: resource.name,
  }));
  if (suggestions.length === 0) {
    return { resourceId: trimmed };
  }
  const catalog = formatIdSuggestions(suggestions);
  if (matches.length > 1) {
    return {
      error: `Multiple resources match "${trimmed}". Pick the exact resourceId from: ${catalog}`,
      suggestions,
    };
  }
  return {
    error: `Unknown resource "${trimmed}" for this service. Available resources: ${catalog}`,
    suggestions,
  };
}

async function listActiveResources(
  client: SupabaseClient,
  companyId: string,
  limit = 100,
): Promise<IdSuggestion[]> {
  try {
    const { data, error } = await client
      .from("scheduling_resources")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name")
      .limit(limit);

    if (error) return [];
    return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
  } catch {
    return [];
  }
}

function matchCatalogByName(
  entries: readonly IdSuggestion[],
  raw: string,
): IdSuggestion[] {
  const lookup = normalizeLookupToken(raw).toLowerCase();
  const exact = entries.filter((entry) => entry.name.toLowerCase() === lookup);
  if (exact.length === 1) return exact;

  return entries.filter((entry) => {
    const name = entry.name.toLowerCase();
    return name.includes(lookup) || lookup.includes(name);
  });
}

async function listServicesForResource(
  client: SupabaseClient,
  companyId: string,
  resourceId: string,
): Promise<IdSuggestion[]> {
  try {
    const { data, error } = await client
      .from("resource_services")
      .select("service_id, scheduling_services!inner(id, name, status, deleted_at)")
      .eq("company_id", companyId)
      .eq("resource_id", resourceId)
      .is("deleted_at", null);

    if (error) return [];
    return (data ?? [])
      .filter((row) => {
        const service = row.scheduling_services as { status?: string; deleted_at?: string | null } | null;
        return service?.status === "active" && !service?.deleted_at;
      })
      .map((row) => {
        const service = row.scheduling_services as { id: string; name: string };
        return { id: String(service.id), name: String(service.name) };
      });
  } catch {
    return [];
  }
}

async function resolveResourceIdentifierGlobally(
  client: SupabaseClient,
  companyId: string,
  raw: string,
): Promise<{ resourceId: string } | { error: string; suggestions: IdSuggestion[] }> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: "resourceId is required.", suggestions: [] };
  }
  if (isUuid(trimmed) || looksLikeLegacySlug(trimmed)) return { resourceId: trimmed };

  const resources = await listActiveResources(client, companyId);
  const matches = matchCatalogByName(resources, trimmed);
  if (matches.length === 1) return { resourceId: matches[0].id };

  const suggestions = matches.length > 0 ? matches : resources;
  const catalog = formatIdSuggestions(suggestions);
  if (matches.length > 1) {
    return {
      error: `Multiple resources match "${trimmed}". Pick the exact resourceId from: ${catalog}`,
      suggestions,
    };
  }
  return {
    error: `Unknown resource "${trimmed}". Available resources: ${catalog}`,
    suggestions,
  };
}

async function inferAvailabilityFromResource(
  client: SupabaseClient,
  companyId: string,
  resourceId: string,
  failedServiceHint?: string,
): Promise<{ serviceId: string; resourceId: string } | { message: string }> {
  const linkedServices = await listServicesForResource(client, companyId, resourceId);
  if (linkedServices.length === 0) {
    return { message: "Resource is not linked to any active service." };
  }
  if (linkedServices.length === 1) {
    return { serviceId: linkedServices[0].id, resourceId };
  }

  if (failedServiceHint) {
    const serviceMatches = matchCatalogByName(linkedServices, failedServiceHint);
    if (serviceMatches.length === 1) {
      return { serviceId: serviceMatches[0].id, resourceId };
    }
  }

  return {
    message: `Resource is linked to multiple services. Pick serviceId from: ${formatIdSuggestions(linkedServices)}.`,
  };
}

async function resolveAvailabilityIdentifiersFromResourceHint(
  client: SupabaseClient,
  input: SearchAvailabilityInput,
  failedServiceHint: string,
): Promise<
  | { ok: true; input: SearchAvailabilityInput }
  | { ok: false; message: string; serviceId: string }
> {
  const resourceCandidate = input.resourceId?.trim() || failedServiceHint.trim();
  if (!resourceCandidate) {
    return { ok: false, message: "serviceId is required.", serviceId: input.serviceId };
  }

  const globalResource = await resolveResourceIdentifierGlobally(
    client,
    input.companyId,
    resourceCandidate,
  );
  if ("error" in globalResource) {
    return {
      ok: false,
      serviceId: input.serviceId,
      message: globalResource.error,
    };
  }

  const inferred = await inferAvailabilityFromResource(
    client,
    input.companyId,
    globalResource.resourceId,
    input.resourceId ? failedServiceHint : undefined,
  );
  if ("message" in inferred) {
    return {
      ok: false,
      serviceId: input.serviceId,
      message: inferred.message,
    };
  }

  return {
    ok: true,
    input: {
      ...input,
      serviceId: inferred.serviceId,
      resourceId: inferred.resourceId,
    },
  };
}

async function normalizeAvailabilityIdentifiers(
  client: SupabaseClient,
  input: SearchAvailabilityInput,
): Promise<
  | { ok: true; input: SearchAvailabilityInput }
  | { ok: false; message: string; serviceId: string }
> {
  const service = await resolveServiceIdentifier(client, input.companyId, input.serviceId);
  if ("error" in service) {
    const fromResource = await resolveAvailabilityIdentifiersFromResourceHint(
      client,
      input,
      input.serviceId,
    );
    if (fromResource.ok) return fromResource;

    return {
      ok: false,
      serviceId: input.serviceId,
      message: `${service.error} Available services: ${formatIdSuggestions(service.suggestions)}.`,
    };
  }

  let resourceId = input.resourceId;
  if (resourceId) {
    const resource = await resolveResourceIdentifier(
      client,
      input.companyId,
      resourceId,
      service.serviceId,
    );
    if ("error" in resource) {
      return {
        ok: false,
        serviceId: service.serviceId,
        message: `${resource.error} Available resources: ${formatIdSuggestions(resource.suggestions)}.`,
      };
    }
    resourceId = resource.resourceId;
  }

  return {
    ok: true,
    input: {
      ...input,
      serviceId: service.serviceId,
      resourceId,
    },
  };
}

function unresolvedAvailabilityResult(
  serviceId: string,
  message: string,
): SearchAvailabilityResult {
  return {
    success: false,
    serviceId,
    durationMinutes: 0,
    availableDates: [],
    resources: [],
    message,
  };
}

function unresolvedFindNextResult(message: string, daysAhead?: number): FindNextAvailableResult {
  return {
    success: false,
    searchedWindow: daysAhead ?? 7,
    nextSuggestion: null,
    message,
    slot: null,
  };
}

async function normalizeFindNextIdentifiers(
  client: SupabaseClient,
  input: FindNextAvailableInput,
): Promise<
  | { ok: true; input: FindNextAvailableInput }
  | { ok: false; message: string; serviceId: string }
> {
  const normalized = await normalizeAvailabilityIdentifiers(client, input);
  if (!normalized.ok) {
    return normalized;
  }
  return { ok: true, input: normalized.input };
}

async function normalizeRecommendIdentifiers(
  client: SupabaseClient,
  input: RecommendAppointmentInput,
): Promise<
  | { ok: true; input: RecommendAppointmentInput }
  | { ok: false; message: string; serviceId: string }
> {
  const service = await resolveServiceIdentifier(client, input.companyId, input.serviceId);
  if ("error" in service) {
    return {
      ok: false,
      serviceId: input.serviceId,
      message: `${service.error} Available services: ${formatIdSuggestions(service.suggestions)}.`,
    };
  }

  let preferredResourceId = input.preferredResourceId;
  if (preferredResourceId) {
    const resource = await resolveResourceIdentifier(
      client,
      input.companyId,
      preferredResourceId,
      service.serviceId,
    );
    if ("error" in resource) {
      return {
        ok: false,
        serviceId: service.serviceId,
        message: `${resource.error} Available resources: ${formatIdSuggestions(resource.suggestions)}.`,
      };
    }
    preferredResourceId = resource.resourceId;
  }

  return {
    ok: true,
    input: {
      ...input,
      serviceId: service.serviceId,
      preferredResourceId,
    },
  };
}

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

function resourceHasSlots(result: SearchAvailabilityResult): boolean {
  return result.resources.some((resource) => resource.slots.length > 0);
}

function compactSearchAvailabilityForAssistant(
  result: SearchAvailabilityResult,
  maxDates = 7,
  maxTimesPerDate = 6,
): SearchAvailabilityResult {
  if ((!result.success && !resourceHasSlots(result)) || result.resources.length === 0) return result;

  let summaryTimesByDate = new Map<string, string[]>();
  let summaryExtraDaysNote = 0;
  const resources = result.resources.map((resource, resourceIndex) => {
    const dates = [...new Set(resource.slots.map((slot) => slot.date))].sort();
    const shownDates = dates.slice(0, maxDates);
    const shownDateSet = new Set(shownDates);
    const timesByDate = new Map<string, string[]>();
    const sampleSlots: SearchAvailabilityResult["resources"][number]["slots"] = [];

    for (const slot of resource.slots) {
      if (!shownDateSet.has(slot.date)) continue;
      const times = timesByDate.get(slot.date) ?? [];
      if (times.length >= maxTimesPerDate) continue;
      if (times.includes(slot.start)) continue;
      times.push(slot.start);
      timesByDate.set(slot.date, times);
      sampleSlots.push(slot);
    }

    if (resourceIndex === 0) {
      summaryTimesByDate = timesByDate;
      const remainingDates = dates.length - shownDates.length;
      if (remainingDates > 0) {
        summaryExtraDaysNote = remainingDates;
      }
    }

    return {
      ...resource,
      slots: sampleSlots,
      totalSlotCount: resource.slots.length,
    };
  });

  const resourceName = result.resources[0]?.resourceName ?? "الطبيب";
  let customerSummary =
    summaryTimesByDate.size > 0
      ? buildAvailabilityCustomerSummary({
          resourceName,
          slotsByDate: summaryTimesByDate,
        })
      : undefined;
  if (customerSummary && summaryExtraDaysNote > 0) {
    customerSummary = `${customerSummary}\n\nوفيه ${summaryExtraDaysNote} يوم إضافي متاح — قولي اليوم اللي يناسبك.`;
  }

  const totalSlotCount = result.resources.reduce((sum, resource) => sum + resource.slots.length, 0);

  return {
    ...result,
    resources,
    customerSummary,
    message:
      customerSummary ??
      `Found ${totalSlotCount} bookable slots across ${result.availableDates.length} day(s).`,
  };
}

export async function executeSearchAvailability(
  client: SupabaseClient,
  engines: SchedulingEnginePort,
  input: SearchAvailabilityInput,
): Promise<SearchAvailabilityResult> {
  const normalized = await normalizeAvailabilityIdentifiers(client, input);
  if (!normalized.ok) {
    return unresolvedAvailabilityResult(normalized.serviceId, normalized.message);
  }
  input = normalized.input;

  if (input.date) {
    const parsed = Date.parse(`${input.date}T00:00:00Z`);
    if (!Number.isNaN(parsed) && parsed < Date.now() - 24 * 60 * 60 * 1000) {
      input = { ...input, date: undefined };
    }
  }

  let context;
  try {
    context = await resolveSchedulingContext(client, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("invalid input syntax for type uuid") ||
      message.includes("Service not found for this company")
    ) {
      const services = await listActiveServices(client, input.companyId);
      return unresolvedAvailabilityResult(
        input.serviceId,
        `Could not resolve service "${input.serviceId}". Use a scheduling service UUID from: ${formatIdSuggestions(services)}.`,
      );
    }
    throw error;
  }

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

  const hasAvailability =
    scanResult.availableDates.length > 0 ||
    scanResult.resources.some((resource) => resource.slots.length > 0);

  if (hasAvailability) {
    return compactSearchAvailabilityForAssistant({
      success: true,
      serviceId: input.serviceId,
      durationMinutes: context.durationMinutes,
      availableDates:
        scanResult.availableDates.length > 0
          ? scanResult.availableDates
          : [...new Set(scanResult.resources.flatMap((resource) => resource.slots.map((slot) => slot.date)))].sort(),
      resources: scanResult.resources,
      searchedWindow: scanResult.searchedWindow,
    });
  }

  return {
    success: false,
    serviceId: input.serviceId,
    durationMinutes: context.durationMinutes,
    availableDates: [],
    resources: scanResult.resources,
    searchedWindow: scanResult.searchedWindow,
    message:
      scanResult.emptyResult?.message ??
      `No appointments are available during the next ${scanResult.searchedWindow} days.`,
    nextSuggestion: scanResult.emptyResult?.nextSuggestion ?? null,
  };
}

export async function executeFindNextAvailable(
  client: SupabaseClient,
  engines: SchedulingEnginePort,
  input: FindNextAvailableInput,
): Promise<FindNextAvailableResult> {
  const normalized = await normalizeFindNextIdentifiers(client, input);
  if (!normalized.ok) {
    return unresolvedFindNextResult(normalized.message, input.daysAhead);
  }
  input = normalized.input;

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
  const normalized = await normalizeRecommendIdentifiers(client, input);
  if (!normalized.ok) {
    return {
      success: false,
      searchedWindow: input.daysAhead ?? 7,
      recommendations: [],
      alternativeResource: null,
      alternativeBranch: null,
      nearestDate: null,
      message: normalized.message,
    };
  }
  input = normalized.input;

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

function isCustomerUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function executeResolveCustomerIdForBooking(
  _client: SupabaseClient,
  input: {
    companyId: string;
    conversationId?: string;
    candidate: string;
  },
): Promise<string | null> {
  const candidate = input.candidate.trim();
  // Never silently map phone/name/linked conversation to a customer here.
  // The tool loop rewrites customerId from search_customer/create_customer in the same turn,
  // which keeps the required name/age intake step.
  if (isCustomerUuid(candidate)) return candidate;
  return null;
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
      source: input.source ?? "ai_assistant",
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

type SchedulingBookingRow = {
  id: string;
  company_id: string;
  customer_id: string;
  status: string;
  start_at: string;
  confirmation_number: string | null;
  resource_id: string | null;
  service_id: string | null;
};

async function loadCompanyBooking(
  client: SupabaseClient,
  companyId: string,
  bookingId: string,
): Promise<SchedulingBookingRow | null> {
  const { data, error } = await client
    .from("scheduling_bookings")
    .select("id, company_id, customer_id, status, start_at, confirmation_number, resource_id, service_id")
    .eq("id", bookingId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: String(data.id),
    company_id: String(data.company_id),
    customer_id: String(data.customer_id),
    status: String(data.status),
    start_at: String(data.start_at),
    confirmation_number: data.confirmation_number == null ? null : String(data.confirmation_number),
    resource_id: data.resource_id == null ? null : String(data.resource_id),
    service_id: data.service_id == null ? null : String(data.service_id),
  };
}

function assertTrustedCustomerOwnership(input: {
  bookingCustomerId: string;
  trustedCustomerId: string | null | undefined;
}): { ok: true } | { ok: false; errors: string[]; message: string } {
  const trusted = typeof input.trustedCustomerId === "string" ? input.trustedCustomerId.trim() : "";
  if (!trusted) {
    return {
      ok: false,
      errors: ["CUSTOMER_CONTEXT_REQUIRED"],
      message: "Trusted customer context is required before modifying bookings.",
    };
  }
  if (input.bookingCustomerId !== trusted) {
    return {
      ok: false,
      errors: ["CUSTOMER_OWNERSHIP_DENIED"],
      message: "This booking does not belong to the customer in this conversation.",
    };
  }
  return { ok: true };
}

async function assertCancelBookingOwnership(
  client: SupabaseClient,
  input: {
    companyId: string;
    bookingCustomerId: string;
    trustedCustomerId: string | null | undefined;
    phone?: string | null;
    conversationScopedCancel?: boolean;
  },
): Promise<{ ok: true } | { ok: false; errors: string[]; message: string }> {
  const trusted = typeof input.trustedCustomerId === "string" ? input.trustedCustomerId.trim() : "";
  if (trusted && input.bookingCustomerId === trusted) {
    return { ok: true };
  }

  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (phone) {
    const customerIds = await resolveCustomerIdsByPhone(client, input.companyId, phone);
    if (customerIds.includes(input.bookingCustomerId)) {
      return { ok: true };
    }
  }

  // The assistant already listed this exact booking during an active cancel flow.
  if (input.conversationScopedCancel) {
    return { ok: true };
  }

  if (!trusted && !phone) {
    return {
      ok: false,
      errors: ["CUSTOMER_CONTEXT_REQUIRED"],
      message: "Trusted customer context or patient phone is required before cancelling a booking.",
    };
  }

  return {
    ok: false,
    errors: ["CUSTOMER_OWNERSHIP_DENIED"],
    message: "This booking does not belong to the customer in this conversation.",
  };
}

async function loadCompanyBookingByReference(
  client: SupabaseClient,
  companyId: string,
  bookingReference: string,
): Promise<SchedulingBookingRow | null> {
  const raw = bookingReference.trim().toUpperCase();
  if (!raw) return null;
  const candidates = [...new Set([raw, raw.replace(/^BK-/, ""), `BK-${raw.replace(/^BK-/, "")}`])];

  const { data, error } = await client
    .from("scheduling_bookings")
    .select("id, company_id, customer_id, status, start_at, confirmation_number, resource_id, service_id")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("confirmation_number", candidates)
    .order("start_at", { ascending: false })
    .limit(5);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) {
    // Fallback: some older rows use a truncated UUID as the customer-facing reference.
    const { data: recent, error: recentError } = await client
      .from("scheduling_bookings")
      .select("id, company_id, customer_id, status, start_at, confirmation_number, resource_id, service_id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("start_at", { ascending: false })
      .limit(100);
    if (recentError) throw new Error(recentError.message);
    const wanted = raw.replace(/^BK-/, "");
    const matched = (recent ?? []).find((row) => {
      const confirmation =
        row.confirmation_number == null ? "" : String(row.confirmation_number).trim().toUpperCase();
      const fallback = String(row.id).replace(/-/g, "").slice(0, 8).toUpperCase();
      return confirmation === raw || confirmation === wanted || fallback === wanted || `BK-${fallback}` === raw;
    });
    if (!matched) return null;
    return {
      id: String(matched.id),
      company_id: String(matched.company_id),
      customer_id: String(matched.customer_id),
      status: String(matched.status),
      start_at: String(matched.start_at),
      confirmation_number:
        matched.confirmation_number == null ? null : String(matched.confirmation_number),
      resource_id: matched.resource_id == null ? null : String(matched.resource_id),
      service_id: matched.service_id == null ? null : String(matched.service_id),
    };
  }

  const row = rows[0]!;
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    customer_id: String(row.customer_id),
    status: String(row.status),
    start_at: String(row.start_at),
    confirmation_number: row.confirmation_number == null ? null : String(row.confirmation_number),
    resource_id: row.resource_id == null ? null : String(row.resource_id),
    service_id: row.service_id == null ? null : String(row.service_id),
  };
}

/**
 * Company + trusted-customer (or phone) scoped booking search with real history (daysBack).
 * Does not trust LLM customerId — only trustedCustomerId from conversation context, or an explicit phone lookup.
 */
export async function executeSearchBookings(
  client: SupabaseClient,
  input: SearchBookingsInput,
): Promise<SearchBookingsResult> {
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const trusted = typeof input.trustedCustomerId === "string" ? input.trustedCustomerId.trim() : "";

  let customerIds: string[] = [];
  if (phone) {
    customerIds = await resolveCustomerIdsByPhone(client, input.companyId, phone);
    if (customerIds.length === 0) {
      return {
        success: true,
        bookings: [],
        total: 0,
        message: "No customer found for that phone number in this company.",
      };
    }
    // Bind conversation to the phone-resolved customer so later tools
    // (check_in / check_out / booking_search) receive trustedCustomerId.
    if (customerIds.length === 1 && input.conversationId?.trim()) {
      await client
        .from("conversations")
        .update({ customer_id: customerIds[0]! })
        .eq("id", input.conversationId.trim())
        .is("customer_id", null);
    }
  } else if (trusted) {
    customerIds = [trusted];
  } else {
    return {
      success: false,
      bookings: [],
      total: 0,
      errors: ["CUSTOMER_CONTEXT_REQUIRED"],
      message:
        "Identify the customer first (search_customer / create_customer) or pass the patient phone so bookings stay scoped.",
    };
  }

  const daysBack = Math.max(1, Math.min(365, Math.floor(input.daysBack ?? 30)));
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - daysBack);

  let query = client
    .from("scheduling_bookings")
    .select("id, customer_id, status, start_at, confirmation_number, resource_id, service_id")
    .eq("company_id", input.companyId)
    .gte("start_at", cutoff.toISOString())
    .is("deleted_at", null)
    .not("status", "eq", "rescheduled")
    .order("start_at", { ascending: false })
    .limit(100);

  if (customerIds.length === 1) {
    query = query.eq("customer_id", customerIds[0]!);
  } else {
    query = query.in("customer_id", customerIds);
  }

  const { data, error } = await query;

  if (error) {
    return {
      success: false,
      bookings: [],
      total: 0,
      message: error.message,
      errors: ["SEARCH_FAILED"],
    };
  }

  const rows = data ?? [];
  const rowCustomerIds = [...new Set(rows.map((row) => String(row.customer_id)).filter(Boolean))];
  const resourceIds = [...new Set(rows.map((row) => row.resource_id).filter(Boolean).map(String))];
  const serviceIds = [...new Set(rows.map((row) => row.service_id).filter(Boolean).map(String))];

  const [customersRes, resourcesRes, servicesRes] = await Promise.all([
    rowCustomerIds.length
      ? client.from("customers").select("id, name").eq("company_id", input.companyId).in("id", rowCustomerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
    resourceIds.length
      ? client.from("scheduling_resources").select("id, name").eq("company_id", input.companyId).in("id", resourceIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
    serviceIds.length
      ? client.from("scheduling_services").select("id, name").eq("company_id", input.companyId).in("id", serviceIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
  ]);

  const customerNames = new Map(
    (customersRes.data ?? []).map((row) => [String(row.id), String(row.name ?? "Customer")]),
  );
  const resourceNames = new Map(
    (resourcesRes.data ?? []).map((row) => [String(row.id), String(row.name ?? "")]),
  );
  const serviceNames = new Map(
    (servicesRes.data ?? []).map((row) => [String(row.id), String(row.name ?? "")]),
  );

  const bookings = rows.map((row) => {
    const confirmation =
      row.confirmation_number == null ? null : String(row.confirmation_number).trim();
    const customerId = String(row.customer_id);
    const resourceId = row.resource_id == null ? null : String(row.resource_id);
    const serviceId = row.service_id == null ? null : String(row.service_id);
    return {
      bookingId: String(row.id),
      customerId,
      customerName: customerNames.get(customerId) ?? "Customer",
      reference: confirmation || String(row.id).replace(/-/g, "").slice(0, 8).toUpperCase(),
      scheduledAt: String(row.start_at),
      status: String(row.status),
      employeeName: resourceId ? resourceNames.get(resourceId) || undefined : undefined,
      serviceName: serviceId ? serviceNames.get(serviceId) || undefined : undefined,
    };
  });

  return {
    success: true,
    bookings,
    total: bookings.length,
    message:
      bookings.length === 0
        ? phone
          ? "No bookings found for that phone number in the selected period."
          : "No bookings found for this customer in the selected period."
        : undefined,
  };
}

function normalizeBookingPhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

function bookingPhonesMatch(left: string, right: string): boolean {
  const a = normalizeBookingPhoneDigits(left);
  const b = normalizeBookingPhoneDigits(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 9) return false;
  return a.slice(-9) === b.slice(-9);
}

async function resolveCustomerIdsByPhone(
  client: SupabaseClient,
  companyId: string,
  phone: string,
): Promise<string[]> {
  const target = normalizeBookingPhoneDigits(phone);
  if (!target) return [];

  const { data, error } = await client
    .from("customers")
    .select("id, phone")
    .eq("company_id", companyId)
    .limit(2000);
  if (error) throw new Error(error.message);

  const matched = (data ?? [])
    .filter((row) => typeof row.phone === "string" && bookingPhonesMatch(row.phone, phone))
    .map((row) => ({
      id: String(row.id),
      phoneDigits: normalizeBookingPhoneDigits(String(row.phone)),
    }))
    .filter((row) => row.id && row.phoneDigits);

  if (matched.length <= 1) {
    return matched.map((row) => row.id);
  }

  // Same national number stored as 010… and 2010… must collapse to one trusted customer.
  // Otherwise conversation binding is skipped and search_bookings merges cross-customer rows.
  const last9Groups = new Map<string, typeof matched>();
  for (const row of matched) {
    const key = row.phoneDigits!.slice(-9);
    const group = last9Groups.get(key) ?? [];
    group.push(row);
    last9Groups.set(key, group);
  }

  if (last9Groups.size !== 1) {
    // Distinct phone identities — keep ambiguous list for ownership checks.
    return [...new Set(matched.map((row) => row.id))];
  }

  const group = [...last9Groups.values()][0]!;
  const ids = [...new Set(group.map((row) => row.id))];
  if (ids.length === 1) return ids;

  const { data: bookingRows, error: bookingError } = await client
    .from("scheduling_bookings")
    .select("customer_id")
    .eq("company_id", companyId)
    .in("customer_id", ids)
    .is("deleted_at", null)
    .limit(500);
  if (bookingError) throw new Error(bookingError.message);

  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, 0);
  for (const row of bookingRows ?? []) {
    const id = String(row.customer_id ?? "");
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const phoneLen = new Map(group.map((row) => [row.id, row.phoneDigits!.length] as const));
  ids.sort((a, b) => {
    const byBookings = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    if (byBookings !== 0) return byBookings;
    // Prefer E.164-style storage (longer digit string) on ties.
    return (phoneLen.get(b) ?? 0) - (phoneLen.get(a) ?? 0);
  });

  return [ids[0]!];
}

export async function executeRescheduleBooking(
  client: SupabaseClient,
  bookingDomain: BookingDomainServicePort,
  input: RescheduleBookingInput,
): Promise<RescheduleBookingResult> {
  if (!bookingDomain.rescheduleBooking) {
    return {
      success: false,
      errors: ["RESCHEDULE_UNAVAILABLE"],
      message: "rescheduleBooking requires BookingDomainService on the scheduling ports.",
    };
  }

  const bookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
  const bookingReference =
    typeof input.bookingReference === "string" ? input.bookingReference.trim() : "";
  // LLM often puts BK-… into bookingId — treat confirmation numbers as references.
  const bookingIdLooksLikeReference = /^BK-\d+$/i.test(bookingId);

  const booking =
    bookingId && !bookingIdLooksLikeReference
      ? await loadCompanyBooking(client, input.companyId, bookingId)
      : await loadCompanyBookingByReference(
          client,
          input.companyId,
          bookingIdLooksLikeReference ? bookingId : bookingReference,
        );

  if (!booking) {
    return {
      success: false,
      errors: ["booking_not_found"],
      message: "Booking not found for this company.",
      customerFacingMessage: "ما لاقيتوش الحجز ده. ابعتي رقم الحجز تاني (مثل BK-000028).",
    };
  }

  const ownership = await assertCancelBookingOwnership(client, {
    companyId: input.companyId,
    bookingCustomerId: booking.customer_id,
    trustedCustomerId: input.trustedCustomerId,
    phone: input.phone,
  });
  if (!ownership.ok) {
    return {
      success: false,
      errors: ownership.errors,
      message: ownership.message,
      customerFacingMessage:
        ownership.errors.includes("CUSTOMER_CONTEXT_REQUIRED")
          ? "محتاجين رقم موبايل المريض عشان نأكد ملكية الحجز قبل تغيير الميعاد."
          : "الحجز ده مش مرتبط بالعميل ده. ابعتي رقم الموبايل الصحيح أو رقم حجز تاني.",
    };
  }

  try {
    const result = await bookingDomain.rescheduleBooking({
      companyId: input.companyId,
      bookingId: booking.id,
      date: input.date,
      slotStart: input.slotStart,
      updatedBy: input.userId,
    });
    const reference =
      booking.confirmation_number != null ? String(booking.confirmation_number) : undefined;
    return {
      success: true,
      bookingId: result.booking.id,
      reference,
      scheduledAt: result.booking.start_at,
      rescheduledAt: new Date().toISOString(),
      customerFacingMessage: reference
        ? `تم تغيير ميعاد الحجز ${reference} بنجاح.`
        : "تم تغيير ميعاد الحجز بنجاح.",
    };
  } catch (error) {
    if (isBookingDomainError(error)) {
      return {
        success: false,
        errors: error.codes,
        message: error.codes.join(", "),
        customerFacingMessage:
          "ما قدرناش نغيّر ميعاد الحجز ده. الميعاد الجديد ممكن يكون غير متاح أو الحجز مش قابل للتعديل.",
      };
    }
    if (error instanceof Error && error.message.startsWith("INVALID_STATUS_TRANSITION:")) {
      return {
        success: false,
        errors: ["invalid_status"],
        message: error.message,
        customerFacingMessage: "حالة الحجز الحالية مش بتسمح بتغيير الميعاد.",
      };
    }
    throw error;
  }
}

export async function executeCancelBooking(
  client: SupabaseClient,
  bookingDomain: BookingDomainServicePort,
  input: CancelBookingInput,
): Promise<CancelBookingResult> {
  if (!bookingDomain.cancelBooking) {
    return {
      success: false,
      errors: ["CANCEL_UNAVAILABLE"],
      message: "cancelBooking requires BookingDomainService on the scheduling ports.",
    };
  }

  const bookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
  const bookingReference =
    typeof input.bookingReference === "string" ? input.bookingReference.trim() : "";

  const booking = bookingId
    ? await loadCompanyBooking(client, input.companyId, bookingId)
    : bookingReference
      ? await loadCompanyBookingByReference(client, input.companyId, bookingReference)
      : null;

  if (!booking) {
    return {
      success: false,
      errors: ["booking_not_found"],
      message: "Booking not found for this company.",
      customerFacingMessage: "ما لاقيتوش الحجز ده. ابعتي رقم الحجز تاني (مثل BK-000028).",
    };
  }

  const ownership = await assertCancelBookingOwnership(client, {
    companyId: input.companyId,
    bookingCustomerId: booking.customer_id,
    trustedCustomerId: input.trustedCustomerId,
    phone: input.phone,
    conversationScopedCancel: Boolean(input.conversationScopedCancel),
  });
  if (!ownership.ok) {
    return {
      success: false,
      errors: ownership.errors,
      message: ownership.message,
      customerFacingMessage:
        "ما قدرناش نلغي الحجز ده. تأكدي إنه ظاهر في قائمة الإلغاء بتاعتك.",
    };
  }

  try {
    const result = await bookingDomain.cancelBooking({
      companyId: input.companyId,
      bookingId: booking.id,
      updatedBy: input.userId,
      reason: input.reason ?? null,
      notes: null,
    });
    const confirmation =
      booking.confirmation_number == null ? null : String(booking.confirmation_number).trim();
    const reference =
      confirmation || String(result.booking.id).replace(/-/g, "").slice(0, 8).toUpperCase();
    const customerFacingMessage = `تم إلغاء الحجز ${reference} بنجاح.`;
    return {
      success: true,
      bookingId: result.booking.id,
      cancelledAt: result.booking.updated_at ?? new Date().toISOString(),
      status: result.booking.status,
      reference,
      customerFacingMessage,
    };
  } catch (error) {
    if (isBookingDomainError(error)) {
      return {
        success: false,
        errors: error.codes,
        message: error.codes.join(", "),
        customerFacingMessage: customerFacingMessageForCancelErrors(error.codes),
      };
    }
    if (error instanceof Error && error.message.startsWith("INVALID_STATUS_TRANSITION:")) {
      return {
        success: false,
        errors: ["invalid_status"],
        message: error.message,
        customerFacingMessage:
          "الحجز ده مش في حالة تسمح بالإلغاء دلوقتي (مثلاً خلص أو اتلغى قبل كده).",
      };
    }
    throw error;
  }
}

function customerFacingMessageForCancelErrors(codes: string[]): string {
  if (codes.includes("cancellation_window_expired")) {
    return "موعد الإلغاء عدّى على الحجز ده — مش هنقدر نلغيه. اختاري موعد لسه قدام من القائمة.";
  }
  if (codes.includes("invalid_status_transition") || codes.includes("invalid_status")) {
    return "الحجز ده مش في حالة تسمح بالإلغاء دلوقتي (مثلاً خلص أو اتلغى قبل كده).";
  }
  if (codes.includes("booking_not_found")) {
    return "ما لاقيتوش الحجز ده. ابعتي رقم الحجز تاني (مثل BK-000028).";
  }
  return "ما قدرناش نلغي الحجز ده. تأكدي من رقم الحجز أو اختاري موعد تاني من القائمة.";
}

/**
 * Phase 5H / 5Q — company + trusted-customer (or phone-resolved) scoped check-in.
 */
export async function executeCheckInBooking(
  client: SupabaseClient,
  bookingDomain: BookingDomainServicePort,
  input: CheckInBookingInput,
): Promise<CheckInBookingResult> {
  if (!bookingDomain.checkInBooking) {
    return {
      success: false,
      errors: ["CHECK_IN_UNAVAILABLE"],
      message: "checkInBooking requires BookingDomainService on the scheduling ports.",
    };
  }

  const bookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
  const bookingReference =
    typeof input.bookingReference === "string" ? input.bookingReference.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";

  let booking = bookingId
    ? await loadCompanyBooking(client, input.companyId, bookingId)
    : null;
  if (!booking && bookingReference) {
    booking = await loadCompanyBookingByReference(client, input.companyId, bookingReference);
  }
  if (!booking) {
    return {
      success: false,
      errors: ["booking_not_found"],
      message: "Booking not found for this company.",
      customerFacingMessage: "ما لقيناش الحجز ده. تأكدي من رقم الحجز.",
    };
  }

  let trustedCustomerId =
    typeof input.trustedCustomerId === "string" ? input.trustedCustomerId.trim() : "";
  if (!trustedCustomerId && phone) {
    const customerIds = await resolveCustomerIdsByPhone(client, input.companyId, phone);
    if (customerIds.includes(booking.customer_id)) {
      trustedCustomerId = booking.customer_id;
      if (input.conversationId?.trim()) {
        await client
          .from("conversations")
          .update({ customer_id: trustedCustomerId })
          .eq("id", input.conversationId.trim())
          .is("customer_id", null);
      }
    }
  }

  const ownership = assertTrustedCustomerOwnership({
    bookingCustomerId: booking.customer_id,
    trustedCustomerId: trustedCustomerId || null,
  });
  if (!ownership.ok) {
    return {
      success: false,
      errors: ownership.errors,
      message: ownership.message,
      customerFacingMessage:
        ownership.errors.includes("CUSTOMER_CONTEXT_REQUIRED")
          ? "محتاجين رقم الموبايل المسجّل على الحجز عشان نسجّل الحضور."
          : ownership.message,
    };
  }

  try {
    const result = await bookingDomain.checkInBooking({
      companyId: input.companyId,
      bookingId: booking.id,
      updatedBy: input.userId,
    });
    return {
      success: true,
      bookingId: result.booking.id,
      checkedInAt: result.booking.updated_at ?? new Date().toISOString(),
      status: result.booking.status,
    };
  } catch (error) {
    if (isBookingDomainError(error)) {
      return {
        success: false,
        errors: error.codes,
        message: error.codes.join(", "),
      };
    }
    if (error instanceof Error && error.message.startsWith("INVALID_STATUS_TRANSITION:")) {
      return {
        success: false,
        errors: ["invalid_status"],
        message: error.message,
      };
    }
    throw error;
  }
}

/**
 * Phase 5H / 5Q.1 — company + trusted-customer (or phone) scoped check-out.
 * AI check_out maps to completeBooking. Clinic pack requires
 * checked_in → with_nurse → in_progress → completed; AI front-desk checkout
 * advances those intermediate steps when still checked_in / with_nurse.
 */
export async function executeCheckOutBooking(
  client: SupabaseClient,
  bookingDomain: BookingDomainServicePort,
  input: CheckOutBookingInput,
): Promise<CheckOutBookingResult> {
  if (!bookingDomain.completeBooking) {
    return {
      success: false,
      errors: ["CHECK_OUT_UNAVAILABLE"],
      message: "completeBooking requires BookingDomainService on the scheduling ports.",
    };
  }

  const bookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
  const bookingReference =
    typeof input.bookingReference === "string" ? input.bookingReference.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";

  let booking = bookingId
    ? await loadCompanyBooking(client, input.companyId, bookingId)
    : null;
  if (!booking && bookingReference) {
    booking = await loadCompanyBookingByReference(client, input.companyId, bookingReference);
  }
  if (!booking) {
    return {
      success: false,
      errors: ["booking_not_found"],
      message: "Booking not found for this company.",
      customerFacingMessage: "ما لقيناش الحجز ده. تأكدي من رقم الحجز.",
    };
  }

  let trustedCustomerId =
    typeof input.trustedCustomerId === "string" ? input.trustedCustomerId.trim() : "";
  if (!trustedCustomerId && phone) {
    const customerIds = await resolveCustomerIdsByPhone(client, input.companyId, phone);
    if (customerIds.includes(booking.customer_id)) {
      trustedCustomerId = booking.customer_id;
      if (input.conversationId?.trim()) {
        await client
          .from("conversations")
          .update({ customer_id: trustedCustomerId })
          .eq("id", input.conversationId.trim())
          .is("customer_id", null);
      }
    }
  }

  const ownership = assertTrustedCustomerOwnership({
    bookingCustomerId: booking.customer_id,
    trustedCustomerId: trustedCustomerId || null,
  });
  if (!ownership.ok) {
    return {
      success: false,
      errors: ownership.errors,
      message: ownership.message,
      customerFacingMessage:
        ownership.errors.includes("CUSTOMER_CONTEXT_REQUIRED")
          ? "محتاجين رقم الموبايل المسجّل على الحجز عشان نسجّل الانصراف."
          : ownership.message,
    };
  }

  try {
    // Advance clinic intermediate states so AI check_out can complete after check_in.
    let status = booking.status;
    for (const next of ["with_nurse", "in_progress"] as const) {
      if (status === "checked_in" && next === "with_nurse") {
        const { error } = await client
          .from("scheduling_bookings")
          .update({ status: next, updated_at: new Date().toISOString(), updated_by: input.userId })
          .eq("id", booking.id)
          .eq("company_id", input.companyId)
          .eq("status", "checked_in");
        if (error) throw error;
        status = next;
      } else if (status === "with_nurse" && next === "in_progress") {
        const { error } = await client
          .from("scheduling_bookings")
          .update({ status: next, updated_at: new Date().toISOString(), updated_by: input.userId })
          .eq("id", booking.id)
          .eq("company_id", input.companyId)
          .eq("status", "with_nurse");
        if (error) throw error;
        status = next;
      }
    }

    const result = await bookingDomain.completeBooking({
      companyId: input.companyId,
      bookingId: booking.id,
      updatedBy: input.userId,
    });
    return {
      success: true,
      bookingId: result.booking.id,
      checkedOutAt: result.booking.updated_at ?? new Date().toISOString(),
      status: result.booking.status,
    };
  } catch (error) {
    if (isBookingDomainError(error)) {
      return {
        success: false,
        errors: error.codes,
        message: error.codes.join(", "),
      };
    }
    if (error instanceof Error && error.message.startsWith("INVALID_STATUS_TRANSITION:")) {
      return {
        success: false,
        errors: ["invalid_status"],
        message: error.message,
        customerFacingMessage:
          "مش هنقدر نسجّل الانصراف دلوقتي — حالة الحجز مش جاهزة للانصراف.",
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
    resolveCustomerIdForBooking(input) {
      return executeResolveCustomerIdForBooking(client, input);
    },
    searchBookings(input) {
      return executeSearchBookings(client, input);
    },
    rescheduleBooking(input) {
      if (!bookingDomain) {
        throw new Error("Booking domain service is not configured for scheduling tools.");
      }
      return executeRescheduleBooking(client, bookingDomain, input);
    },
    cancelBooking(input) {
      if (!bookingDomain) {
        throw new Error("Booking domain service is not configured for scheduling tools.");
      }
      return executeCancelBooking(client, bookingDomain, input);
    },
    checkInBooking(input) {
      if (!bookingDomain) {
        throw new Error("Booking domain service is not configured for scheduling tools.");
      }
      return executeCheckInBooking(client, bookingDomain, input);
    },
    checkOutBooking(input) {
      if (!bookingDomain) {
        throw new Error("Booking domain service is not configured for scheduling tools.");
      }
      return executeCheckOutBooking(client, bookingDomain, input);
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
