import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareRecommendations,
  formatDisplayTime,
  scoreRecommendationCandidate,
} from "./recommendation-scoring.js";
import { recommendAppointments } from "./recommendation-engine.js";
import type { AvailabilityScanEnginePort } from "../availability-engine/availability-scanner.js";

describe("recommendation-scoring", () => {
  it("scores same resource and branch higher than alternatives", () => {
    const preferred = scoreRecommendationCandidate(
      {
        resourceId: "resource-1",
        resourceName: "Dr Ahmed",
        branchId: "branch-1",
        branchName: "Main",
        capacity: 1,
        durationMinutes: 30,
        date: "2026-07-30",
        start: "09:00",
        end: "09:30",
        timezone: "UTC",
        slotIndex: 0,
        slotsOnDate: 2,
      },
      { resourceId: "resource-1", branchId: "branch-1", date: "2026-07-30", time: "09:00" },
      "2026-07-29",
    );

    const alternative = scoreRecommendationCandidate(
      {
        resourceId: "resource-2",
        resourceName: "Dr Sarah",
        branchId: "branch-1",
        branchName: "Main",
        capacity: 1,
        durationMinutes: 30,
        date: "2026-07-29",
        start: "16:00",
        end: "16:30",
        timezone: "UTC",
        slotIndex: 0,
        slotsOnDate: 1,
      },
      { resourceId: "resource-1", branchId: "branch-1", date: "2026-07-30", time: "09:00" },
      "2026-07-29",
    );

    assert.ok(preferred.score > alternative.score);
    assert.equal(preferred.factors.sameResource, 40);
    assert.equal(alternative.factors.resourceChange, -20);
  });

  it("formats display time", () => {
    assert.equal(formatDisplayTime("09:00"), "9:00 AM");
    assert.equal(formatDisplayTime("16:00"), "4:00 PM");
  });

  it("sorts by score then earliest slot", () => {
    assert.ok(
      compareRecommendations(
        { score: 80, date: "2026-07-30", start: "10:00" },
        { score: 90, date: "2026-07-29", start: "09:00" },
      ) > 0,
    );
  });
});

describe("recommendation-engine", () => {
  const engines: AvailabilityScanEnginePort = {
    async resolveAvailability(_companyId, resourceId, _serviceId, date) {
      if (resourceId === "resource-1") {
        return { available: false };
      }
      return { available: date === "2026-07-29" || date === "2026-07-31" };
    },
    async getAvailableSlots(_companyId, resourceId, _serviceId, date) {
      if (resourceId === "resource-1") {
        return {
          available: false,
          timezone: "UTC",
          durationMinutes: 30,
          generatedSlots: [],
        };
      }
      if (resourceId === "resource-2") {
        return {
          available: true,
          timezone: "UTC",
          durationMinutes: 30,
          generatedSlots: [{ start: "16:00", end: "16:30" }],
        };
      }
      return {
        available: false,
        timezone: "UTC",
        durationMinutes: 30,
        generatedSlots: [],
      };
    },
  };

  it("recommends alternative resource when preferred resource is unavailable", async () => {
    const result = await recommendAppointments(engines, {
      companyId: "company-1",
      serviceId: "service-1",
      durationMinutes: 30,
      resources: [
        {
          resourceId: "resource-1",
          resourceName: "Dr Ahmed",
          branchId: "branch-1",
          branchName: "Main",
          capacity: 1,
        },
        {
          resourceId: "resource-2",
          resourceName: "Dr Sarah",
          branchId: "branch-1",
          branchName: "Main",
          capacity: 1,
        },
      ],
      branches: [{ branchId: "branch-1", branchName: "Main", isPrimary: true, priority: 1 }],
      startDate: "2026-07-29",
      daysAhead: 7,
      timezone: "UTC",
      preferences: { resourceId: "resource-1", branchId: "branch-1" },
    });

    assert.equal(result.alternativeResource?.recommendedResource.name, "Dr Sarah");
    assert.equal(result.alternativeResource?.earliestSlot.start, "16:00");
    assert.ok(result.recommendations.length <= 3);
  });

  it("returns top ranked recommendations for preferred date and time", async () => {
    const preferredDateEngines: AvailabilityScanEnginePort = {
      async resolveAvailability(_companyId, resourceId, _serviceId, date) {
        if (resourceId === "resource-1") {
          return { available: date === "2026-07-30" };
        }
        return { available: false };
      },
      async getAvailableSlots(_companyId, resourceId, _serviceId, date) {
        if (resourceId === "resource-1" && date === "2026-07-30") {
          return {
            available: true,
            timezone: "UTC",
            durationMinutes: 30,
            generatedSlots: [{ start: "09:00", end: "09:30" }],
          };
        }
        return {
          available: false,
          timezone: "UTC",
          durationMinutes: 30,
          generatedSlots: [],
        };
      },
    };

    const result = await recommendAppointments(preferredDateEngines, {
      companyId: "company-1",
      serviceId: "service-1",
      durationMinutes: 30,
      resources: [
        {
          resourceId: "resource-1",
          resourceName: "Dr Ahmed",
          branchId: "branch-1",
          branchName: "Main",
          capacity: 1,
        },
      ],
      branches: [{ branchId: "branch-1", branchName: "Main", isPrimary: true, priority: 1 }],
      startDate: "2026-07-29",
      daysAhead: 7,
      timezone: "UTC",
      preferences: { resourceId: "resource-1", date: "2026-07-30", time: "09:00" },
      limit: 3,
    });

    assert.equal(result.success, true);
    assert.equal(result.recommendations[0]?.date, "2026-07-30");
    assert.equal(result.recommendations[0]?.start, "09:00");
  });
});
