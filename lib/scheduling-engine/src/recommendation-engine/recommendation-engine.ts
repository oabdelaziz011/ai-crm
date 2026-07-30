import {
  buildEmptyAvailabilityResult,
  normalizeDaysAhead,
} from "../availability-engine/scan-available-dates.js";
import {
  scanAvailableDates,
  type AvailabilityScanEnginePort,
} from "../availability-engine/availability-scanner.js";
import {
  compareRecommendations,
  findNearestDateCandidate,
  formatDisplayTime,
  rankBranches,
  scoreRecommendationCandidate,
} from "./recommendation-scoring.js";
import type {
  AlternativeBranchRecommendation,
  AlternativeResourceRecommendation,
  AppointmentRecommendation,
  NearestDateRecommendation,
  RecommendAppointmentsInput,
  RecommendAppointmentsResult,
  RecommendationCandidate,
} from "./recommendation-types.js";

function buildCandidatesFromScan(
  scanResult: Awaited<ReturnType<typeof scanAvailableDates>>,
  resources: RecommendAppointmentsInput["resources"],
  timezone: string,
): RecommendationCandidate[] {
  const resourceMap = new Map(resources.map((resource) => [resource.resourceId, resource]));
  const candidates: RecommendationCandidate[] = [];

  for (const resourceResult of scanResult.resources) {
    const resource = resourceMap.get(resourceResult.resourceId);
    if (!resource) continue;

    const slotsByDate = new Map<string, typeof resourceResult.slots>();
    for (const slot of resourceResult.slots) {
      const existing = slotsByDate.get(slot.date) ?? [];
      existing.push(slot);
      slotsByDate.set(slot.date, existing);
    }

    for (const [date, slots] of slotsByDate.entries()) {
      slots.forEach((slot, index) => {
        candidates.push({
          resourceId: resourceResult.resourceId,
          resourceName: resourceResult.resourceName,
          branchId: resource.branchId,
          branchName: resource.branchName,
          capacity: resourceResult.capacity,
          durationMinutes: resourceResult.durationMinutes,
          date,
          start: slot.start,
          end: slot.end,
          timezone,
          slotIndex: index,
          slotsOnDate: slots.length,
        });
      });
    }
  }

  return candidates;
}

function buildRecommendations(
  candidates: RecommendationCandidate[],
  input: RecommendAppointmentsInput,
): AppointmentRecommendation[] {
  const limit = Math.max(1, input.limit ?? 3);

  return candidates
    .map((candidate) => {
      const scored = scoreRecommendationCandidate(candidate, input.preferences, input.startDate);
      return {
        score: scored.score,
        reason: scored.reason,
        resourceId: candidate.resourceId,
        resourceName: candidate.resourceName,
        branchId: candidate.branchId,
        branchName: candidate.branchName,
        date: candidate.date,
        start: candidate.start,
        end: candidate.end,
        displayTime: formatDisplayTime(candidate.start),
        durationMinutes: candidate.durationMinutes,
        capacity: candidate.capacity,
        timezone: candidate.timezone,
        factors: scored.factors,
      };
    })
    .sort(compareRecommendations)
    .slice(0, limit);
}

function buildAlternativeResource(
  candidates: RecommendationCandidate[],
  resources: RecommendAppointmentsInput["resources"],
  preferences: RecommendAppointmentsInput["preferences"],
): AlternativeResourceRecommendation | null {
  const preferredResourceId = preferences?.resourceId;
  if (!preferredResourceId) return null;

  const preferredResource = resources.find((resource) => resource.resourceId === preferredResourceId);
  const preferredCandidates = candidates.filter((candidate) => candidate.resourceId === preferredResourceId);
  if (preferredCandidates.length > 0) return null;

  const preferredBranchId = preferences?.branchId ?? preferredResource?.branchId ?? null;
  const sameBranchCandidates = candidates.filter((candidate) => {
    if (candidate.resourceId === preferredResourceId) return false;
    if (!preferredBranchId) return true;
    return candidate.branchId === preferredBranchId;
  });

  const pool = sameBranchCandidates.length > 0 ? sameBranchCandidates : candidates;
  if (pool.length === 0) return null;

  const best = [...pool].sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    return left.start.localeCompare(right.start);
  })[0]!;

  const requestedName = preferredResource?.resourceName ?? preferredResourceId;

  return {
    requestedResource: {
      id: preferredResourceId,
      name: requestedName,
    },
    recommendedResource: {
      id: best.resourceId,
      name: best.resourceName,
    },
    reason: sameBranchCandidates.length > 0
      ? `${requestedName} has no availability. ${best.resourceName} has the earliest slot at the same branch.`
      : `${requestedName} has no availability. ${best.resourceName} has the earliest available slot.`,
    earliestSlot: {
      date: best.date,
      start: best.start,
      end: best.end,
      branchId: best.branchId,
      branchName: best.branchName,
    },
  };
}

function buildAlternativeBranch(
  candidates: RecommendationCandidate[],
  branches: RecommendAppointmentsInput["branches"],
  preferences: RecommendAppointmentsInput["preferences"],
): AlternativeBranchRecommendation | null {
  const preferredBranchId = preferences?.branchId;
  if (!preferredBranchId) return null;

  const preferredBranch = branches.find((branch) => branch.branchId === preferredBranchId);
  if (!preferredBranch) return null;

  const preferredBranchCandidates = candidates.filter((candidate) => candidate.branchId === preferredBranchId);
  if (preferredBranchCandidates.length > 0) return null;

  const branchRank = rankBranches(branches);
  for (const branch of branchRank) {
    if (branch.branchId === preferredBranchId) continue;
    const branchCandidates = candidates.filter((candidate) => candidate.branchId === branch.branchId);
    if (branchCandidates.length === 0) continue;

    const best = [...branchCandidates].sort((left, right) => {
      if (left.date !== right.date) return left.date.localeCompare(right.date);
      return left.start.localeCompare(right.start);
    })[0]!;

    return {
      requestedBranch: {
        id: preferredBranch.branchId,
        name: preferredBranch.branchName,
      },
      suggestedBranch: {
        id: branch.branchId,
        name: branch.branchName,
      },
      distance: null,
      earliestSlot: {
        date: best.date,
        start: best.start,
        end: best.end,
        resourceId: best.resourceId,
        resourceName: best.resourceName,
      },
    };
  }

  return null;
}

function buildNearestDate(
  candidates: RecommendationCandidate[],
  preferences: RecommendAppointmentsInput["preferences"],
): NearestDateRecommendation | null {
  const requestedDate = preferences?.date;
  if (!requestedDate) return null;

  const hasRequestedDate = candidates.some((candidate) => candidate.date === requestedDate);
  if (hasRequestedDate) return null;

  const nearest = findNearestDateCandidate(candidates, requestedDate, preferences);
  if (!nearest) return null;

  return {
    requestedDate,
    nearestDate: nearest.date,
    resourceId: nearest.resourceId,
    resourceName: nearest.resourceName,
    branchId: nearest.branchId,
    branchName: nearest.branchName,
    start: nearest.start,
    end: nearest.end,
    reason: nearest.resourceId === preferences?.resourceId
      ? "Nearest available date for the requested resource."
      : "Nearest available date across qualified resources.",
  };
}

export async function recommendAppointments(
  engines: AvailabilityScanEnginePort,
  input: RecommendAppointmentsInput,
): Promise<RecommendAppointmentsResult> {
  const searchedWindow = normalizeDaysAhead(input.daysAhead, input.maxBookingWindowDays);
  const scanResources = input.resources.map((resource) => ({
    resourceId: resource.resourceId,
    resourceName: resource.resourceName,
    capacity: resource.capacity,
  }));

  const scanResult = await scanAvailableDates(engines, {
    companyId: input.companyId,
    serviceId: input.serviceId,
    durationMinutes: input.durationMinutes,
    resources: scanResources,
    startDate: input.startDate,
    daysAhead: searchedWindow,
    timezone: input.timezone,
    maxBookingWindowDays: input.maxBookingWindowDays,
    referenceNow: input.referenceNow,
  });

  const candidates = buildCandidatesFromScan(scanResult, input.resources, input.timezone);
  if (candidates.length === 0) {
    const empty = scanResult.emptyResult ?? buildEmptyAvailabilityResult(searchedWindow);
    return {
      success: false,
      searchedWindow,
      recommendations: [],
      alternativeResource: null,
      alternativeBranch: null,
      nearestDate: null,
      message: empty.message,
      nextSuggestion: empty.nextSuggestion,
    };
  }

  const recommendations = buildRecommendations(candidates, input);

  return {
    success: recommendations.length > 0,
    searchedWindow,
    recommendations,
    alternativeResource: buildAlternativeResource(candidates, input.resources, input.preferences),
    alternativeBranch: buildAlternativeBranch(candidates, input.branches, input.preferences),
    nearestDate: buildNearestDate(candidates, input.preferences),
  };
}

export class RecommendationEngine {
  constructor(private readonly engines: AvailabilityScanEnginePort) {}

  recommendAppointments(input: RecommendAppointmentsInput): Promise<RecommendAppointmentsResult> {
    return recommendAppointments(this.engines, input);
  }
}
