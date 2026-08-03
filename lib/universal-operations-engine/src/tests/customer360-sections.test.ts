import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveVisibleSections, DEFAULT_CUSTOMER360_SECTIONS } from "../types/customer360-types.js";

describe("Customer360 section engine", () => {
  it("shows receptionist sections", () => {
    const sections = resolveVisibleSections(DEFAULT_CUSTOMER360_SECTIONS, "receptionist");
    const ids = sections.map((s) => s.id);
    assert.ok(ids.includes("todays_operation"));
    assert.ok(ids.includes("invoices_payments"));
    assert.ok(!ids.includes("files"));
  });

  it("shows all sections for manager", () => {
    const sections = resolveVisibleSections(DEFAULT_CUSTOMER360_SECTIONS, "manager");
    assert.equal(sections.length, DEFAULT_CUSTOMER360_SECTIONS.length);
  });

  it("cashier sees payments not medical files", () => {
    const sections = resolveVisibleSections(DEFAULT_CUSTOMER360_SECTIONS, "cashier");
    const ids = sections.map((s) => s.id);
    assert.ok(ids.includes("invoices_payments"));
    assert.ok(!ids.includes("todays_operation"));
    assert.ok(!ids.includes("files"));
  });
});
