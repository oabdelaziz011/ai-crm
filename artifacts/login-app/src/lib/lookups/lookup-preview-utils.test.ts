import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  containsTemplateToken,
  resolvePreviewFilters,
} from "./lookup-preview-utils";

describe("lookup preview utils", () => {
  it("detects template tokens", () => {
    assert.equal(containsTemplateToken("{{selected_service.id}}"), true);
    assert.equal(containsTemplateToken("svc_1"), false);
  });

  it("defers preview when template tokens are unresolved", () => {
    const result = resolvePreviewFilters(
      {
        service_id: "{{selected_service.id}}",
        resource_id: "{{selected_resource.id}}",
        date: "{{selected_date}}",
      },
      {},
    );

    assert.deepEqual(result.unresolvedKeys, ["service_id", "resource_id", "date"]);
    assert.equal(Object.keys(result.resolvedFilters).length, 0);
  });

  it("substitutes preview values for template tokens", () => {
    const result = resolvePreviewFilters(
      {
        service_id: "{{selected_service.id}}",
        resource_id: "{{selected_resource.id}}",
        date: "{{selected_date}}",
      },
      {
        service_id: "svc_1",
        resource_id: "res_1",
        date: "2026-07-28",
      },
    );

    assert.deepEqual(result.unresolvedKeys, []);
    assert.deepEqual(result.resolvedFilters, {
      service_id: "svc_1",
      resource_id: "res_1",
      date: "2026-07-28",
    });
  });

  it("passes literal filter values through unchanged", () => {
    const result = resolvePreviewFilters(
      { branch_id: "branch_1", status: "active" },
      {},
    );

    assert.deepEqual(result.unresolvedKeys, []);
    assert.deepEqual(result.resolvedFilters, {
      branch_id: "branch_1",
      status: "active",
    });
  });
});
