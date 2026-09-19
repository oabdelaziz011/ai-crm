import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveListNodeSections } from "./list-lookup-resolver.js";

describe("resolveListNodeSections language filter", () => {
  it("does not inject conversation.language into services lookup filters", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const sections = await resolveListNodeSections(
      {
        id: "list-1",
        type: "action",
        config: {
          action: "send_list",
          mode: "lookup",
          lookup: "services",
          displayField: "name",
          valueField: "id",
          filters: {},
        },
      } as never,
      "company-1",
      {
        async fetchListOptions(_companyId, config) {
          seen.push({ ...(config.filters ?? {}) });
          return [{ id: "svc-1", title: "Consult", value: "svc-1" }];
        },
      },
      { conversation: { language: "ar" } },
    );

    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.language, undefined);
    assert.equal(sections[0]?.rows.length, 1);
  });

  it("injects conversation.language into customer_scheduling_bookings lookup filters", async () => {
    const seen: Array<Record<string, unknown>> = [];
    await resolveListNodeSections(
      {
        id: "list-bookings",
        type: "action",
        config: {
          action: "send_list",
          mode: "lookup",
          lookup: "customer_scheduling_bookings",
          displayField: "display_label",
          valueField: "id",
          filters: { customer_id: "{{customer.id}}" },
        },
      } as never,
      "company-1",
      {
        async fetchListOptions(_companyId, config) {
          seen.push({ ...(config.filters ?? {}) });
          return [{ id: "bk-1", title: "19 Sep 10:00 AM", value: "bk-1" }];
        },
      },
      { conversation: { language: "ar" }, customer: { id: "cust-1" } },
    );

    assert.equal(seen[0]?.language, "ar");
  });

  it("returns an empty section list when customer_scheduling_bookings has no rows", async () => {
    const sections = await resolveListNodeSections(
      {
        id: "list-bookings-empty",
        type: "action",
        config: {
          action: "send_list",
          mode: "lookup",
          lookup: "customer_scheduling_bookings",
          displayField: "display_label",
          valueField: "id",
          filters: { customer_id: "cust-1" },
        },
      } as never,
      "company-1",
      {
        async fetchListOptions() {
          return [];
        },
      },
      {},
    );

    assert.deepEqual(sections, []);
  });

  it("injects conversation.language into available_dates lookup filters", async () => {
    const seen: Array<Record<string, unknown>> = [];
    await resolveListNodeSections(
      {
        id: "list-2",
        type: "action",
        config: {
          action: "send_list",
          mode: "lookup",
          lookup: "available_dates",
          displayField: "label",
          valueField: "id",
          filters: {},
        },
      } as never,
      "company-1",
      {
        async fetchListOptions(_companyId, config) {
          seen.push({ ...(config.filters ?? {}) });
          return [{ id: "2026-08-12", title: "Wed 12", value: "2026-08-12" }];
        },
      },
      { conversation: { language: "ar" } },
    );

    assert.equal(seen[0]?.language, "ar");
  });
});
