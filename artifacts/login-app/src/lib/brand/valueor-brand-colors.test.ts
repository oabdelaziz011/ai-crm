import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VALUEOR_OR_PRIMARY,
  VALUEOR_OR_PRIMARY_DARK_HSL,
  VALUEOR_OR_PRIMARY_HSL,
  VALUEOR_OR_PRIMARY_ON_DARK,
} from "./valueor-brand-colors.ts";
import { DEFAULT_BRAND_COLORS } from "@/lib/company-workspace/brand-center/defaults.ts";

describe("ValueOR brand primary token", () => {
  it("keeps DEFAULT_BRAND_COLORS.primary locked to the official OR color", () => {
    assert.equal(VALUEOR_OR_PRIMARY, "#0D9488");
    assert.equal(DEFAULT_BRAND_COLORS.primary, VALUEOR_OR_PRIMARY);
    assert.equal(DEFAULT_BRAND_COLORS.sidebarActive, VALUEOR_OR_PRIMARY);
  });

  it("exposes a single HSL family for light/dark CSS tokens", () => {
    assert.equal(VALUEOR_OR_PRIMARY_HSL, "174.7 83.9% 31.6%");
    assert.equal(VALUEOR_OR_PRIMARY_DARK_HSL, "174.7 70% 48%");
    assert.equal(VALUEOR_OR_PRIMARY_ON_DARK, "#3EE6C8");
  });
});
