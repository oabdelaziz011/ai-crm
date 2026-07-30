export type {
  AvailabilityEngineInput,
  AvailabilityResolveOptions,
  AvailabilityUnavailabilityReason,
  LocalTimePeriod,
  ResolvedAvailability,
} from "../availability-engine/types";

export type { AvailabilityContextSnapshot } from "../availability-engine/availability-context";

export { TimezoneResolver } from "../availability-engine/timezone-resolver";
export { AvailabilityPolicy } from "../availability-engine/availability-policy";
export { AvailabilityResolver } from "../availability-engine/availability-resolver";
export { AvailabilityContextLoader } from "../availability-engine/availability-context-loader";
export {
  AvailabilityEngine,
  getAvailabilityEngine,
} from "../availability-engine/availability-engine";

export {
  parseTimeToMinutes,
  formatMinutesToTime,
  subtractMinutePeriods,
  mergeMinutePeriods,
} from "../availability-engine/period-utils";
export {
  AVAILABLE_DATES_EMPTY_MESSAGE,
  AVAILABLE_DATES_WINDOW_DAYS,
  DEFAULT_DAYS_AHEAD,
  MAX_DAYS_AHEAD,
  MIN_DAYS_AHEAD,
  InvalidDaysAheadError,
  addDaysIso,
  buildDateScanRange,
  buildEmptyAvailabilityResult,
  filterAvailableDates,
  formatEmptyAvailabilityMessage,
  normalizeDaysAhead,
  suggestNextWindow,
} from "../availability-engine/scan-available-dates.js";
export {
  getNextAvailableSlot,
  scanAvailableDates,
  type AvailabilityResourceInput,
  type AvailabilityScanEnginePort,
  type GetNextAvailableSlotInput,
  type NextAvailableSlot,
  type ScanAvailableDatesInput,
  type ScanAvailableDatesResult,
  type ScannedAvailabilitySlot,
  type ScannedResourceAvailability,
} from "../availability-engine/availability-scanner.js";
