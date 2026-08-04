import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveVisibleSections } from "../types/customer360-types.js";
import { SEED_CUSTOMER360_SECTIONS } from "../config/seed/operations-seed-data.js";

describe("Customer360 sections", () => {
  it("filters sections by receptionist role", () => {
    const sections = resolveVisibleSections(SEED_CUSTOMER360_SECTIONS, "receptionist");
    assert.ok(sections.some((s) => s.id === "todays_operation"));
    assert.ok(!sections.some((s) => s.id === "tasks"));
  });

  it("includes all sections for manager", () => {
    const sections = resolveVisibleSections(SEED_CUSTOMER360_SECTIONS, "manager");
    assert.equal(sections.length, SEED_CUSTOMER360_SECTIONS.length);
  });

  it("excludes nurse-only sections for cashier", () => {
    const sections = resolveVisibleSections(SEED_CUSTOMER360_SECTIONS, "cashier");
    assert.ok(sections.some((s) => s.id === "customer_summary"));
    assert.ok(!sections.some((s) => s.id === "files"));
  });
});
