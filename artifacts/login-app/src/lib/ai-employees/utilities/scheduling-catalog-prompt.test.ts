import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  employeeHasSchedulingActionTools,
  employeeHasSchedulingCatalogTools,
  resolveSchedulingCatalogPromptForEmployee,
} from "./scheduling-catalog-prompt.js";

describe("scheduling catalog prompt gating", () => {
  it("does not treat booking_search alone as catalog-worthy", () => {
    assert.equal(employeeHasSchedulingCatalogTools(["booking_search"]), false);
    assert.equal(employeeHasSchedulingActionTools(["booking_search"]), true);
  });

  it("requires at least one operational scheduling tool for catalog injection", () => {
    assert.equal(employeeHasSchedulingCatalogTools(["create_booking"]), true);
    assert.equal(employeeHasSchedulingCatalogTools(["search_availability"]), true);
    assert.equal(employeeHasSchedulingCatalogTools(["knowledge_search"]), false);
    assert.equal(employeeHasSchedulingCatalogTools([]), false);
  });

  it("resolveSchedulingCatalogPromptForEmployee skips DB when scheduling tools are disabled", async () => {
    const client = {
      from() {
        throw new Error("should not query scheduling tables when catalog is gated off");
      },
    };

    const result = await resolveSchedulingCatalogPromptForEmployee(
      client as never,
      "company-a",
      ["search_ticket"],
    );

    assert.equal(result, null);
  });
});
