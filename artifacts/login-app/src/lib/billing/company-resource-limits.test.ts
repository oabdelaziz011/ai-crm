import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatResourceOccupancy,
  occupancyAllowsCreate,
  occupancyDisplayUsed,
  resourceLimitsForPackageCode,
  type ResourceOccupancySlice,
} from "./company-resource-limits.ts";

describe("resourceLimitsForPackageCode", () => {
  it("maps Basic/Starter to 5 users and 1 branch", () => {
    assert.deepEqual(resourceLimitsForPackageCode("basic"), { maxUsers: 5, maxBranches: 1 });
    assert.deepEqual(resourceLimitsForPackageCode("starter_p72"), { maxUsers: 5, maxBranches: 1 });
  });

  it("maps Pro/Growth to 25 users and 5 branches", () => {
    assert.deepEqual(resourceLimitsForPackageCode("pro"), { maxUsers: 25, maxBranches: 5 });
    assert.deepEqual(resourceLimitsForPackageCode("growth_p72"), { maxUsers: 25, maxBranches: 5 });
  });

  it("maps Enterprise users to unlimited and 20 branches", () => {
    assert.deepEqual(resourceLimitsForPackageCode("enterprise"), {
      maxUsers: null,
      maxBranches: 20,
    });
  });
});

describe("formatResourceOccupancy", () => {
  it("formats current / max and unlimited", () => {
    assert.equal(formatResourceOccupancy(4, 5, "Unlimited"), "4 / 5");
    assert.equal(formatResourceOccupancy(12, null, "Unlimited"), "12 / Unlimited");
  });
});

describe("occupancyDisplayUsed", () => {
  it("prefers effective_used then current + pending", () => {
    assert.equal(
      occupancyDisplayUsed({
        current_count: 4,
        pending_reservations: 1,
        effective_used: 5,
        max_allowed: 5,
        remaining: 0,
        is_over_limit: false,
        is_unlimited: false,
      }),
      5,
    );
    assert.equal(
      occupancyDisplayUsed({
        current_count: 4,
        pending_reservations: 1,
        max_allowed: 5,
        remaining: 0,
        is_over_limit: false,
        is_unlimited: false,
      }),
      5,
    );
  });
});

describe("occupancyAllowsCreate", () => {
  it("blocks when 4 occupying + 1 pending fills a max of 5", () => {
    const pendingFull: ResourceOccupancySlice = {
      current_count: 4,
      pending_reservations: 1,
      effective_used: 5,
      max_allowed: 5,
      remaining: 0,
      is_over_limit: false,
      is_unlimited: false,
    };
    assert.equal(occupancyAllowsCreate(pendingFull), false);
  });

  const atLimit: ResourceOccupancySlice = {
    current_count: 5,
    max_allowed: 5,
    remaining: 0,
    is_over_limit: false,
    is_unlimited: false,
  };
  const overLimit: ResourceOccupancySlice = {
    current_count: 8,
    max_allowed: 5,
    remaining: 0,
    is_over_limit: true,
    is_unlimited: false,
  };
  const under: ResourceOccupancySlice = {
    current_count: 3,
    max_allowed: 5,
    remaining: 2,
    is_over_limit: false,
    is_unlimited: false,
  };
  const unlimited: ResourceOccupancySlice = {
    current_count: 100,
    max_allowed: null,
    remaining: null,
    is_over_limit: false,
    is_unlimited: true,
  };

  it("blocks at-limit and over-limit, allows remaining and unlimited", () => {
    assert.equal(occupancyAllowsCreate(under), true);
    assert.equal(occupancyAllowsCreate(atLimit), false);
    assert.equal(occupancyAllowsCreate(overLimit), false);
    assert.equal(occupancyAllowsCreate(unlimited), true);
  });
});
