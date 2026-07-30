import {
  buildDateScanRange,
  buildEmptyAvailabilityResult,
  filterAvailableDates,
  normalizeDaysAhead,
  type EmptyAvailabilityResult,
} from "./scan-available-dates.js";

export type AvailabilityScanEnginePort = {
  resolveAvailability(
    companyId: string,
    resourceId: string,
    serviceId: string,
    date: string,
    options?: { respectBookingRules?: boolean; referenceNow?: Date },
  ): Promise<{ available: boolean }>;
  getAvailableSlots(
    companyId: string,
    resourceId: string,
    serviceId: string,
    date: string,
    options?: { respectBookingRules?: boolean; referenceNow?: Date },
  ): Promise<{
    available: boolean;
    timezone: string;
    durationMinutes: number;
    generatedSlots: Array<{ start: string; end: string }>;
  }>;
};

export type AvailabilityResourceInput = {
  resourceId: string;
  resourceName: string;
  capacity: number;
};

export type ScannedAvailabilitySlot = {
  date: string;
  start: string;
  end: string;
};

export type ScannedResourceAvailability = {
  resourceId: string;
  resourceName: string;
  durationMinutes: number;
  capacity: number;
  availableDates: string[];
  slots: ScannedAvailabilitySlot[];
};

export type ScanAvailableDatesInput = {
  companyId: string;
  serviceId: string;
  durationMinutes: number;
  resources: AvailabilityResourceInput[];
  startDate: string;
  daysAhead?: number;
  timezone: string;
  maxBookingWindowDays?: number;
  singleDate?: string;
  referenceNow?: Date;
};

export type ScanAvailableDatesResult = {
  availableDates: string[];
  resources: ScannedResourceAvailability[];
  searchedWindow: number;
  startDate: string;
  timezone: string;
  emptyResult?: EmptyAvailabilityResult;
};

export type NextAvailableSlot = {
  date: string;
  slot: { start: string; end: string };
  resource: { id: string; name: string; capacity: number };
  service: { id: string; durationMinutes: number };
  timezone: string;
};

export type GetNextAvailableSlotInput = Omit<
  ScanAvailableDatesInput,
  "singleDate"
>;

type DateSlotSnapshot = {
  available: boolean;
  slots: Array<{ start: string; end: string }>;
  timezone: string;
  durationMinutes: number;
};

async function resolveResourceDateSlots(
  engines: AvailabilityScanEnginePort,
  input: {
    companyId: string;
    serviceId: string;
    resourceId: string;
    date: string;
    referenceNow: Date;
  },
): Promise<DateSlotSnapshot> {
  const availability = await engines.resolveAvailability(
    input.companyId,
    input.resourceId,
    input.serviceId,
    input.date,
    { respectBookingRules: true, referenceNow: input.referenceNow },
  );

  if (!availability.available) {
    return { available: false, slots: [], timezone: "UTC", durationMinutes: 0 };
  }

  const resolved = await engines.getAvailableSlots(
    input.companyId,
    input.resourceId,
    input.serviceId,
    input.date,
    { respectBookingRules: true, referenceNow: input.referenceNow },
  );

  if (!resolved.available || resolved.generatedSlots.length === 0) {
    return {
      available: false,
      slots: [],
      timezone: resolved.timezone,
      durationMinutes: resolved.durationMinutes,
    };
  }

  return {
    available: true,
    slots: resolved.generatedSlots,
    timezone: resolved.timezone,
    durationMinutes: resolved.durationMinutes,
  };
}

function resolveDatesToScan(input: ScanAvailableDatesInput, searchedWindow: number): string[] {
  if (input.singleDate) {
    return input.singleDate >= input.startDate ? [input.singleDate] : [];
  }
  return buildDateScanRange(input.startDate, searchedWindow);
}

export async function scanAvailableDates(
  engines: AvailabilityScanEnginePort,
  input: ScanAvailableDatesInput,
): Promise<ScanAvailableDatesResult> {
  const referenceNow = input.referenceNow ?? new Date();
  const searchedWindow = normalizeDaysAhead(input.daysAhead, input.maxBookingWindowDays);
  const datesToScan = resolveDatesToScan(input, searchedWindow);
  const availableDatesSet = new Set<string>();
  const resources: ScannedResourceAvailability[] = [];

  for (const resource of input.resources) {
    const resourceAvailableDates: string[] = [];
    const slots: ScannedAvailabilitySlot[] = [];
    let durationMinutes = input.durationMinutes;

    for (const date of datesToScan) {
      const snapshot = await resolveResourceDateSlots(engines, {
        companyId: input.companyId,
        serviceId: input.serviceId,
        resourceId: resource.resourceId,
        date,
        referenceNow,
      });

      if (!snapshot.available) continue;

      durationMinutes = snapshot.durationMinutes || durationMinutes;
      resourceAvailableDates.push(date);
      availableDatesSet.add(date);

      for (const generated of snapshot.slots) {
        slots.push({ date, start: generated.start, end: generated.end });
      }
    }

    resources.push({
      resourceId: resource.resourceId,
      resourceName: resource.resourceName,
      durationMinutes,
      capacity: resource.capacity,
      availableDates: filterAvailableDates(resourceAvailableDates, input.startDate, searchedWindow),
      slots,
    });
  }

  const availableDates = filterAvailableDates(availableDatesSet, input.startDate, searchedWindow);
  const result: ScanAvailableDatesResult = {
    availableDates,
    resources,
    searchedWindow,
    startDate: input.startDate,
    timezone: input.timezone,
  };

  if (availableDates.length === 0 && !input.singleDate) {
    result.emptyResult = buildEmptyAvailabilityResult(searchedWindow);
  }

  return result;
}

export async function getNextAvailableSlot(
  engines: AvailabilityScanEnginePort,
  input: GetNextAvailableSlotInput,
): Promise<NextAvailableSlot | null> {
  const referenceNow = input.referenceNow ?? new Date();
  const searchedWindow = normalizeDaysAhead(input.daysAhead, input.maxBookingWindowDays);
  const datesToScan = buildDateScanRange(input.startDate, searchedWindow);

  for (const date of datesToScan) {
    for (const resource of input.resources) {
      const snapshot = await resolveResourceDateSlots(engines, {
        companyId: input.companyId,
        serviceId: input.serviceId,
        resourceId: resource.resourceId,
        date,
        referenceNow,
      });

      if (!snapshot.available || snapshot.slots.length === 0) continue;

      const firstSlot = snapshot.slots[0]!;
      return {
        date,
        slot: { start: firstSlot.start, end: firstSlot.end },
        resource: {
          id: resource.resourceId,
          name: resource.resourceName,
          capacity: resource.capacity,
        },
        service: {
          id: input.serviceId,
          durationMinutes: snapshot.durationMinutes || input.durationMinutes,
        },
        timezone: snapshot.timezone || input.timezone,
      };
    }
  }

  return null;
}
