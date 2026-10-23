import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_EMPLOYEE_CORE_INSTRUCTIONS,
  AI_EMPLOYEE_CORE_INSTRUCTIONS_VERSION,
  composeEmployeeSystemInstructions,
} from "./employee-core-instructions.js";

describe("AI employee core instructions", () => {
  it("keeps company instructions after the versioned core block", () => {
    const parts = composeEmployeeSystemInstructions({
      companyInstructions: "Always greet as ValueOR Cairo.",
      retrievalLines: ["[Catalog] Widget lasts 2 years."],
      currentDate: "2026-10-21",
    });
    assert.equal(parts[0]?.includes(AI_EMPLOYEE_CORE_INSTRUCTIONS_VERSION), true);
    assert.equal(parts[1], "CURRENT DATE (Africa/Cairo): 2026-10-21. Tomorrow is 2026-10-22.");
    assert.equal(parts[2], "COMPANY INSTRUCTIONS:\nAlways greet as ValueOR Cairo.");
    assert.match(parts[3] ?? "", /Widget lasts 2 years/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /do not guess a year/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /list_demo_types/);
    assert.ok(AI_EMPLOYEE_CORE_INSTRUCTIONS.length < 2200);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /search_products/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /create_demo_booking/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /request_send_quote/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /Egyptian Arabic/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /English/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /German/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /Do not translate product names/);
    assert.match(AI_EMPLOYEE_CORE_INSTRUCTIONS, /not_listed/);
  });

  it("omits an empty company block instead of erasing the core", () => {
    const parts = composeEmployeeSystemInstructions({ companyInstructions: "  " });
    assert.equal(parts.length, 1);
    assert.match(parts[0] ?? "", /Do not invent prices/);
  });
});
