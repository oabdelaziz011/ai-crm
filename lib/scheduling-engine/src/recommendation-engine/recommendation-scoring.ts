import { addDaysIso } from "../availability-engine/scan-available-dates.js";
import type {
  RecommendationCandidate,
  RecommendationPreferences,
  RecommendationScoreFactors,
} from "./recommendation-types.js";

export const RECOMMENDATION_SCORE_WEIGHTS = {
  sameResource: 40,
  sameDay: 30,
  sameBranch: 20,
  preferredHours: 10,
  branchChange: -15,
  resourceChange: -20,
  proximityPerDay: 3,
  maxProximityBonus: 15,
  capacityPerSeat: 1,
  maxCapacityBonus: 5,
  firstSlotOfDay: 5,
} as const;

const PREFERRED_HOUR_RANGES = [
  { start: 9 * 60, end: 12 * 60 },
  { start: 14 * 60, end: 17 * 60 },
] as const;

function parseTimeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T12:00:00.000Z`);
  const to = Date.parse(`${toDate}T12:00:00.000Z`);
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function isPreferredHour(start: string): boolean {
  const minutes = parseTimeToMinutes(start);
  if (minutes == null) return false;
  return PREFERRED_HOUR_RANGES.some((range) => minutes >= range.start && minutes < range.end);
}

function isNearPreferredTime(start: string, preferredTime: string): boolean {
  const startMinutes = parseTimeToMinutes(start);
  const preferredMinutes = parseTimeToMinutes(preferredTime);
  if (startMinutes == null || preferredMinutes == null) return false;
  return Math.abs(startMinutes - preferredMinutes) <= 30;
}

export function scoreRecommendationCandidate(
  candidate: RecommendationCandidate,
  preferences: RecommendationPreferences | undefined,
  startDate: string,
): { score: number; factors: RecommendationScoreFactors; reason: string } {
  const factors: RecommendationScoreFactors = {
    sameResource: 0,
    sameDay: 0,
    sameBranch: 0,
    preferredHours: 0,
    branchChange: 0,
    resourceChange: 0,
    proximity: 0,
    capacity: 0,
    scheduleFit: 0,
  };

  const reasons: string[] = [];

  if (preferences?.resourceId && candidate.resourceId === preferences.resourceId) {
    factors.sameResource = RECOMMENDATION_SCORE_WEIGHTS.sameResource;
    reasons.push("same resource");
  } else if (preferences?.resourceId && candidate.resourceId !== preferences.resourceId) {
    factors.resourceChange = RECOMMENDATION_SCORE_WEIGHTS.resourceChange;
  }

  if (preferences?.date && candidate.date === preferences.date) {
    factors.sameDay = RECOMMENDATION_SCORE_WEIGHTS.sameDay;
    reasons.push("requested date");
  }

  if (preferences?.branchId && candidate.branchId === preferences.branchId) {
    factors.sameBranch = RECOMMENDATION_SCORE_WEIGHTS.sameBranch;
    reasons.push("same branch");
  } else if (preferences?.branchId && candidate.branchId && candidate.branchId !== preferences.branchId) {
    factors.branchChange = RECOMMENDATION_SCORE_WEIGHTS.branchChange;
  }

  if (preferences?.time && isNearPreferredTime(candidate.start, preferences.time)) {
    factors.preferredHours = RECOMMENDATION_SCORE_WEIGHTS.preferredHours;
    reasons.push("preferred time");
  } else if (isPreferredHour(candidate.start)) {
    factors.preferredHours = RECOMMENDATION_SCORE_WEIGHTS.preferredHours;
    reasons.push("business hours");
  }

  const dayOffset = Math.max(0, daysBetween(startDate, candidate.date));
  factors.proximity = Math.max(
    0,
    RECOMMENDATION_SCORE_WEIGHTS.maxProximityBonus - dayOffset * RECOMMENDATION_SCORE_WEIGHTS.proximityPerDay,
  );

  factors.capacity = Math.min(
    RECOMMENDATION_SCORE_WEIGHTS.maxCapacityBonus,
    Math.max(0, candidate.capacity) * RECOMMENDATION_SCORE_WEIGHTS.capacityPerSeat,
  );

  if (candidate.slotIndex === 0) {
    factors.scheduleFit = RECOMMENDATION_SCORE_WEIGHTS.firstSlotOfDay;
  } else if (candidate.slotsOnDate > 0 && candidate.slotIndex === candidate.slotsOnDate - 1) {
    factors.scheduleFit = Math.floor(RECOMMENDATION_SCORE_WEIGHTS.firstSlotOfDay / 2);
  }

  const score = Object.values(factors).reduce((total, value) => total + value, 0);
  const reason = reasons.length > 0 ? reasons.join(", ") : "earliest available slot";

  return { score, factors, reason };
}

export function compareRecommendations(
  left: { score: number; date: string; start: string },
  right: { score: number; date: string; start: string },
): number {
  if (right.score !== left.score) return right.score - left.score;
  if (left.date !== right.date) return left.date.localeCompare(right.date);
  return left.start.localeCompare(right.start);
}

export function findNearestDateCandidate(
  candidates: RecommendationCandidate[],
  requestedDate: string,
  preferences: RecommendationPreferences | undefined,
): RecommendationCandidate | null {
  if (candidates.length === 0) return null;

  const ranked = [...candidates].sort((left, right) => {
    const leftDistance = Math.abs(daysBetween(requestedDate, left.date));
    const rightDistance = Math.abs(daysBetween(requestedDate, right.date));
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;

    if (preferences?.resourceId) {
      if (left.resourceId === preferences.resourceId && right.resourceId !== preferences.resourceId) return -1;
      if (right.resourceId === preferences.resourceId && left.resourceId !== preferences.resourceId) return 1;
    }

    if (preferences?.branchId) {
      if (left.branchId === preferences.branchId && right.branchId !== preferences.branchId) return -1;
      if (right.branchId === preferences.branchId && left.branchId !== preferences.branchId) return 1;
    }

    if (left.date !== right.date) return left.date.localeCompare(right.date);
    return left.start.localeCompare(right.start);
  });

  return ranked[0] ?? null;
}

export function formatDisplayTime(time: string): string {
  const minutes = parseTimeToMinutes(time);
  if (minutes == null) return time;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function rankBranches(
  branches: Array<{ branchId: string; branchName: string; isPrimary: boolean; priority: number }>,
): Array<{ branchId: string; branchName: string; isPrimary: boolean; priority: number }> {
  return [...branches].sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
    if (left.priority !== right.priority) return right.priority - left.priority;
    return left.branchName.localeCompare(right.branchName);
  });
}

export { addDaysIso, daysBetween };
