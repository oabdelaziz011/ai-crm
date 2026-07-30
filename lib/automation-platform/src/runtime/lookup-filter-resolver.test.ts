import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLookupFilterValues } from "./lookup-filter-resolver.js";

describe("resolveLookupFilterValues", () => {
  it("resolves workflow variable tokens in lookup filters", () => {
    const resolved = resolveLookupFilterValues(
      {
        service_id: "{{selected_service.id}}",
        resource_id: "{{selected_resource.id}}",
        date: "{{selected_date}}",
      },
      {
        selected_service: { id: "svc_1" },
        selected_resource: { id: "res_1" },
        selected_date: "2026-07-28",
      },
    );

    assert.deepEqual(resolved, {
      service_id: "svc_1",
      resource_id: "res_1",
      date: "2026-07-28",
    });
  });

  it("passes through literal filter values", () => {
    const resolved = resolveLookupFilterValues(
      { service_id: "svc_static", resource_id: "res_static", date: "2026-08-01" },
      {},
    );
    assert.equal(resolved.service_id, "svc_static");
  });

  it("extracts date from lookup record objects for date filters", () => {
    const resolved = resolveLookupFilterValues(
      {
        service_id: "{{selected_service.id}}",
        resource_id: "{{selected_resource.id}}",
        date: "{{selected_date}}",
      },
      {
        selected_service: { id: "svc_1" },
        selected_resource: { id: "res_1" },
        selected_date: {
          date: "2026-08-02",
          display_date: "Sun, Aug 2, 2026",
          timezone: "Africa/Cairo",
        },
      },
    );

    assert.deepEqual(resolved, {
      service_id: "svc_1",
      resource_id: "res_1",
      date: "2026-08-02",
    });
  });
});
