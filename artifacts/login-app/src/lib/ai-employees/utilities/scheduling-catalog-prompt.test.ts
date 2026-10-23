import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSchedulingCatalogPromptAddon,
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

  it("assembled prompt uses published product-demo product ids and omits clinic sales_demo ids", async () => {
    const clinicSalesDemoId = "a1035bb1-b527-4706-b0d0-e163397e8d20";
    const catalogProductId = "979845ef-bcae-43a0-a81c-6e9cd657d7bd";
    const offeringId = "d31e9d04-2738-4546-a8aa-4d1c90cc4ed6";
    const operationalId = "11111111-1111-4111-8111-111111111111";

    const tables: Record<string, unknown[]> = {
      scheduling_services: [
        { id: operationalId, name: "Clinic visit", service_kind: "operational" },
        { id: clinicSalesDemoId, name: "Local sales demo", service_kind: "sales_demo" },
      ],
      product_demo_offerings: [
        {
          id: offeringId,
          title: "ValueOR software",
          catalog_product_id: catalogProductId,
          duration_minutes: 30,
        },
      ],
      branches: [],
      scheduling_resources: [],
      resource_services: [],
      scheduling_service_pricing_rules: [],
    };

    const client = {
      from(table: string) {
        const payload = { data: tables[table] ?? [], error: null };
        const query = {
          select() {
            return query;
          },
          eq() {
            return query;
          },
          is() {
            return query;
          },
          order() {
            return query;
          },
          limit() {
            return query;
          },
          then(onFulfilled: (value: typeof payload) => unknown, onRejected?: (reason: unknown) => unknown) {
            return Promise.resolve(payload).then(onFulfilled, onRejected);
          },
        };
        return query;
      },
    };

    const prompt = await buildSchedulingCatalogPromptAddon(client as never, "company-a");
    assert.ok(prompt);
    const demoHeading = prompt.indexOf("Sales demo types");
    const demoSection = prompt.slice(demoHeading, prompt.indexOf("Branches:"));
    assert.match(demoSection, new RegExp(`serviceId=${catalogProductId}`));
    assert.match(demoSection, new RegExp(`offeringId=${offeringId}`));
    assert.doesNotMatch(prompt, new RegExp(clinicSalesDemoId));
    assert.match(prompt, new RegExp(`serviceId=${operationalId}`));
    assert.match(prompt, /Never use a clinic scheduling_services id/);
  });
});
