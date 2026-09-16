import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VALUEOR_OR_PRIMARY } from "@/lib/brand/valueor-brand-colors.ts";
import {
  brandDrivingColorsMatchOfficial,
  inferBrandingMode,
  normalizeBrandingMode,
  resolveActiveBrandColors,
  withBrandingMode,
} from "./branding-mode.ts";
import { createDefaultBrandDocument, DEFAULT_BRAND_COLORS } from "./defaults.ts";
import { normalizeBrandCenterDocument, toPersistedBrandingPayload } from "./normalize.ts";
import type { CompanyBrandCenterDocument, CompanyBrandColors } from "./types.ts";

function customColors(primary = "#FF0000"): CompanyBrandColors {
  return {
    ...DEFAULT_BRAND_COLORS,
    primary,
    sidebarActive: primary,
  };
}

function sampleDoc(
  partial?: Partial<CompanyBrandCenterDocument>,
): CompanyBrandCenterDocument {
  return {
    ...createDefaultBrandDocument(),
    ...partial,
    colors: partial?.colors ?? createDefaultBrandDocument().colors,
  };
}

describe("company branding mode", () => {
  it("official mode resolves #0D9488 from VALUEOR_OR_PRIMARY", () => {
    const doc = sampleDoc({
      brandingMode: "official",
      colors: customColors("#AABBCC"),
    });
    const active = resolveActiveBrandColors(doc);
    assert.equal(VALUEOR_OR_PRIMARY, "#0D9488");
    assert.equal(active.primary, VALUEOR_OR_PRIMARY);
    assert.equal(active.primary, DEFAULT_BRAND_COLORS.primary);
    assert.deepEqual(active, DEFAULT_BRAND_COLORS);
  });

  it("custom mode resolves company custom color", () => {
    const colors = customColors("#112233");
    const doc = sampleDoc({ brandingMode: "custom", colors });
    assert.equal(resolveActiveBrandColors(doc).primary, "#112233");
    assert.equal(resolveActiveBrandColors(doc).sidebarActive, "#112233");
  });

  it("switching official → custom restores custom color without mutation of storage", () => {
    const colors = customColors("#ABCDEF");
    const official = sampleDoc({ brandingMode: "official", colors });
    assert.equal(resolveActiveBrandColors(official).primary, VALUEOR_OR_PRIMARY);
    assert.equal(official.colors.primary, "#ABCDEF");

    const custom = withBrandingMode(official, "custom");
    assert.equal(custom.colors.primary, "#ABCDEF");
    assert.equal(resolveActiveBrandColors(custom).primary, "#ABCDEF");
  });

  it("switching custom → official does not delete custom color", () => {
    const colors = customColors("#998877");
    const custom = sampleDoc({ brandingMode: "custom", colors });
    const official = withBrandingMode(custom, "official");
    assert.equal(official.brandingMode, "official");
    assert.equal(official.colors.primary, "#998877");
    assert.equal(resolveActiveBrandColors(official).primary, VALUEOR_OR_PRIMARY);
  });

  it("persists brandingMode and keeps stored colors under official", () => {
    const colors = customColors("#445566");
    const doc = sampleDoc({ brandingMode: "official", colors });
    const payload = toPersistedBrandingPayload(doc);
    assert.equal(payload.brandingMode, "official");
    assert.equal((payload.colors as CompanyBrandColors).primary, "#445566");
  });

  it("new / empty branding defaults to official", () => {
    const empty = normalizeBrandCenterDocument({
      brandingRaw: {},
      logoUrl: null,
      companyName: "Acme",
      legalName: null,
      supportEmail: null,
      supportPhone: null,
      invoiceFooter: null,
      branchBranding: null,
    });
    assert.equal(empty.brandingMode, "official");
    assert.equal(empty.colors.primary, VALUEOR_OR_PRIMARY);
  });

  it("existing companies preserve intentional custom branding via inference", () => {
    const doc = normalizeBrandCenterDocument({
      brandingRaw: {
        colors: customColors("#00AA88"),
      },
      logoUrl: null,
      companyName: "Custom Co",
      legalName: null,
      supportEmail: null,
      supportPhone: null,
      invoiceFooter: null,
      branchBranding: null,
    });
    assert.equal(doc.brandingMode, "custom");
    assert.equal(doc.colors.primary, "#00AA88");
  });

  it("existing default-looking colors infer official", () => {
    assert.equal(inferBrandingMode(DEFAULT_BRAND_COLORS), "official");
    assert.equal(normalizeBrandingMode(undefined, DEFAULT_BRAND_COLORS), "official");
    assert.equal(normalizeBrandingMode("custom", DEFAULT_BRAND_COLORS), "custom");
    assert.ok(brandDrivingColorsMatchOfficial(DEFAULT_BRAND_COLORS));
  });

  it("company A resolution cannot affect company B document", () => {
    const companyA = sampleDoc({
      brandingMode: "official",
      colors: customColors("#111111"),
      general: { ...createDefaultBrandDocument().general, companyName: "A" },
    });
    const companyB = sampleDoc({
      brandingMode: "custom",
      colors: customColors("#222222"),
      general: { ...createDefaultBrandDocument().general, companyName: "B" },
    });
    assert.equal(resolveActiveBrandColors(companyA).primary, VALUEOR_OR_PRIMARY);
    assert.equal(resolveActiveBrandColors(companyB).primary, "#222222");
    assert.equal(companyA.colors.primary, "#111111");
    assert.equal(companyB.colors.primary, "#222222");
  });

  it("semantic colors stay independent from official primary", () => {
    const active = resolveActiveBrandColors(
      sampleDoc({ brandingMode: "official", colors: customColors("#00FF00") }),
    );
    assert.equal(active.primary, VALUEOR_OR_PRIMARY);
    assert.equal(active.success, DEFAULT_BRAND_COLORS.success);
    assert.equal(active.warning, DEFAULT_BRAND_COLORS.warning);
    assert.equal(active.danger, DEFAULT_BRAND_COLORS.danger);
    assert.notEqual(active.success, active.primary);
    assert.notEqual(active.warning, active.primary);
  });

  it("createDefaultBrandDocument uses official for new companies", () => {
    const doc = createDefaultBrandDocument();
    assert.equal(doc.brandingMode, "official");
    assert.equal(doc.colors.primary, VALUEOR_OR_PRIMARY);
  });
});
