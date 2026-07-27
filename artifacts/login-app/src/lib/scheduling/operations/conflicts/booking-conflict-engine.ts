import type { SchedulingResourceType } from "@/lib/scheduling/types";
import type { BookingValidationErrorCode } from "@/lib/scheduling/booking-domain";
import type { OperationsBookingView } from "@/lib/scheduling/operations/types";
import { instantOverlaps } from "@/lib/scheduling/booking-domain/booking-time-utils";

export type BookingConflictCategory =
  | "doctor"
  | "room"
  | "equipment"
  | "service"
  | "time_overlap";

export type BookingConflictDetail = {
  category: BookingConflictCategory;
  code: BookingValidationErrorCode;
  messageKey: string;
  resourceId?: string;
  resourceName?: string;
  conflictingBookingId?: string;
};

export type BookingConflictResult = {
  valid: boolean;
  conflicts: BookingConflictDetail[];
};

const PERSONNEL_TYPES: SchedulingResourceType[] = ["doctor", "employee", "therapist"];
const ROOM_TYPES: SchedulingResourceType[] = ["room"];
const EQUIPMENT_TYPES: SchedulingResourceType[] = ["equipment", "chair"];

export function resourceTypeToConflictCategory(
  resourceType: string,
): BookingConflictCategory {
  if (PERSONNEL_TYPES.includes(resourceType as SchedulingResourceType)) return "doctor";
  if (ROOM_TYPES.includes(resourceType as SchedulingResourceType)) return "room";
  if (EQUIPMENT_TYPES.includes(resourceType as SchedulingResourceType)) return "equipment";
  return "doctor";
}

const ERROR_TO_CATEGORY: Partial<Record<BookingValidationErrorCode, BookingConflictCategory>> = {
  booking_conflict: "time_overlap",
  capability_missing: "service",
  slot_unavailable: "time_overlap",
  resource_not_found: "doctor",
  resource_inactive: "doctor",
  service_not_found: "service",
  service_inactive: "service",
};

const CATEGORY_MESSAGE_KEY: Record<BookingConflictCategory, string> = {
  doctor: "scheduling.operations.conflicts.doctor",
  room: "scheduling.operations.conflicts.room",
  equipment: "scheduling.operations.conflicts.equipment",
  service: "scheduling.operations.conflicts.service",
  time_overlap: "scheduling.operations.conflicts.timeOverlap",
};

/** Pure conflict detection for operations timeline moves. */
export class BookingConflictEngine {
  static detectLocalOverlap(
    bookings: OperationsBookingView[],
    candidate: {
      bookingId: string;
      resourceId: string;
      resourceType: string;
      serviceId: string;
      startAt: string;
      endAt: string;
    },
  ): BookingConflictResult {
    const conflicts: BookingConflictDetail[] = [];
    const category = resourceTypeToConflictCategory(candidate.resourceType);

    for (const existing of bookings) {
      if (existing.id === candidate.bookingId) continue;
      if (!["pending", "confirmed", "checked_in"].includes(existing.status)) continue;

      const overlaps = instantOverlaps(
        candidate.startAt,
        candidate.endAt,
        existing.startAt,
        existing.endAt,
      );

      if (!overlaps) continue;

      if (existing.resourceId === candidate.resourceId) {
        conflicts.push({
          category,
          code: "booking_conflict",
          messageKey: CATEGORY_MESSAGE_KEY[category],
          resourceId: existing.resourceId,
          resourceName: existing.resource?.name ?? undefined,
          conflictingBookingId: existing.id,
        });
      }

      if (existing.serviceId === candidate.serviceId && existing.resourceId !== candidate.resourceId) {
        conflicts.push({
          category: "service",
          code: "booking_conflict",
          messageKey: CATEGORY_MESSAGE_KEY.service,
          conflictingBookingId: existing.id,
        });
      }
    }

    if (conflicts.some((c) => c.code === "booking_conflict")) {
      conflicts.push({
        category: "time_overlap",
        code: "booking_conflict",
        messageKey: CATEGORY_MESSAGE_KEY.time_overlap,
      });
    }

    return { valid: conflicts.length === 0, conflicts: dedupeConflicts(conflicts) };
  }

  static fromValidationErrors(
    codes: BookingValidationErrorCode[],
    resourceType?: string,
  ): BookingConflictResult {
    const conflicts = codes.map((code) => {
      const category =
        ERROR_TO_CATEGORY[code] ??
        (resourceType ? resourceTypeToConflictCategory(resourceType) : "time_overlap");
      return {
        category,
        code,
        messageKey: CATEGORY_MESSAGE_KEY[category],
      };
    });
    return { valid: conflicts.length === 0, conflicts: dedupeConflicts(conflicts) };
  }
}

function dedupeConflicts(conflicts: BookingConflictDetail[]): BookingConflictDetail[] {
  const seen = new Set<string>();
  return conflicts.filter((c) => {
    const key = `${c.category}:${c.code}:${c.conflictingBookingId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
