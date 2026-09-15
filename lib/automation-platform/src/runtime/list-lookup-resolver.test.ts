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

  it("injects customer identity into customer_bookings filters", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const sections = await resolveListNodeSections(
      {
        id: "list-bookings",
        type: "action",
        config: {
          action: "send_list",
          mode: "lookup",
          lookup: "customer_bookings",
          displayField: "display_label",
          valueField: "id",
          filters: { phone: "{{whatsapp_sender_phone}}" },
        },
      } as never,
      "company-1",
      {
        async fetchListOptions(_companyId, config) {
          seen.push({ ...(config.filters ?? {}) });
          return [];
        },
      },
      { customer: { id: "cust-9", phone: "01012345678" } },
    );

    assert.equal(seen[0]?.customer_id, "cust-9");
    assert.equal(seen[0]?.phone, "01012345678");
    assert.deepEqual(sections, []);
  });

  it("uses a collected customer_phone for customer_bookings", async () => {
    const seen: Array<Record<string, unknown>> = [];
    await resolveListNodeSections(
      {
        id: "list-bookings",
        type: "action",
        config: {
          action: "send_list",
          mode: "lookup",
          lookup: "customer_bookings",
          displayField: "display_label",
          valueField: "id",
          filters: { phone: "{{customer_phone}}" },
        },
      } as never,
      "company-1",
      {
        async fetchListOptions(_companyId, config) {
          seen.push({ ...(config.filters ?? {}) });
          return [];
        },
      },
      { customer_phone: "01011404109" },
    );

    assert.equal(seen[0]?.phone, "01011404109");
  });
});
