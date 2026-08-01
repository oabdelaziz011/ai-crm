import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEmployeeToolScopeDenial,
  createToolNotAllowedDenial,
  EMPLOYEE_TOOL_SCOPE_DENIED_CODE,
  serializeRuntimeToolDenial,
  TOOL_NOT_ALLOWED_CODE,
} from "./runtime-tool-denial-factory.js";

describe("runtime-tool-denial-factory", () => {
  it("creates structured TOOL_NOT_ALLOWED denial", () => {
    const denial = createToolNotAllowedDenial({ toolKey: "booking_search" });
    assert.equal(denial.success, false);
    assert.equal(denial.errorCode, TOOL_NOT_ALLOWED_CODE);
    assert.equal(denial.toolKey, "booking_search");
    assert.match(denial.reason, /booking_search/);
    assert.ok(denial.timestamp);
    assert.equal(denial.employeeId, undefined);
  });

  it("creates structured EMPLOYEE_TOOL_SCOPE_DENIED denial", () => {
    const denial = createEmployeeToolScopeDenial({
      toolKey: "merge_customers",
      reason: "Not permitted",
      employeeId: "employee-a",
    });
    assert.equal(denial.errorCode, EMPLOYEE_TOOL_SCOPE_DENIED_CODE);
    assert.equal(denial.employeeId, "employee-a");
    assert.equal(denial.reason, "Not permitted");
    const serialized = JSON.parse(serializeRuntimeToolDenial(denial)) as Record<string, unknown>;
    assert.equal(serialized.message, "Not permitted");
  });

  it("serializes legacy-compatible denial payloads", () => {
    const denial = createToolNotAllowedDenial({ toolKey: "booking_search" });
    const parsed = JSON.parse(serializeRuntimeToolDenial(denial)) as Record<string, unknown>;
    assert.equal(parsed.reason, parsed.message);
  });
});
