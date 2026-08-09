import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCountryMarket,
  formatOpportunityDate,
  formatOpportunityMoney,
  resolveOpportunityCreatedByUserId,
  translateOpportunityProbabilityReason,
  translateOpportunityProbabilitySource,
} from "./opportunity360-ui";
import { setCompanyLocaleRuntime } from "@/lib/company-locale/runtime";

describe("resolveOpportunityCreatedByUserId", () => {
  it("returns actor from opportunity_created event", () => {
    const userId = resolveOpportunityCreatedByUserId([
      {
        id: "h1",
        opportunityId: "o1",
        eventType: "stage_changed",
        fieldName: null,
        previousValue: null,
        newValue: null,
        summary: "Stage changed",
        actorUserId: "other-user",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "h2",
        opportunityId: "o1",
        eventType: "opportunity_created",
        fieldName: null,
        previousValue: null,
        newValue: null,
        summary: "Created",
        actorUserId: "creator-user",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    assert.equal(userId, "creator-user");
  });

  it("returns null when creation event is missing", () => {
    assert.equal(resolveOpportunityCreatedByUserId([]), null);
  });
});

describe("formatCountryMarket", () => {
  it("joins country and market with separator", () => {
    assert.equal(formatCountryMarket("SA", "GCC"), "SA · GCC");
    assert.equal(formatCountryMarket("SA", null), "SA");
    assert.equal(formatCountryMarket(null, null), "");
  });
});

describe("formatOpportunityDate", () => {
  it("returns empty string for missing values", () => {
    assert.equal(formatOpportunityDate(null, "en"), "");
    assert.equal(formatOpportunityDate("", "en"), "");
  });

  it("formats valid ISO dates using company locale", () => {
    setCompanyLocaleRuntime({ intlLocale: "en-US", currency: "USD", timezone: "UTC" });
    const formatted = formatOpportunityDate("2026-08-08T12:00:00.000Z", "en-US");
    assert.match(formatted, /2026/);
  });
});

describe("translateOpportunityProbabilitySource", () => {
  it("returns Arabic label for manual source", () => {
    const label = translateOpportunityProbabilitySource("manual", (key) =>
      key === "opportunities360.probabilitySource.manual" ? "يدوي" : key,
    );
    assert.equal(label, "يدوي");
  });
});

describe("formatOpportunityMoney", () => {
  it("never uses company billing default when opportunity currency is absent", () => {
    setCompanyLocaleRuntime({ intlLocale: "en-US", currency: "EGP", timezone: "UTC" });
    assert.equal(formatOpportunityMoney(100, null), "");
  });
});

describe("translateOpportunityProbabilityReason", () => {
  it("uses pipeline stage names for seeded-from-stage backend reasons", () => {
    const stageById = new Map<string, { id: string; pipelineId: string; name: string; slug: string; stageKey: string; sortOrder: number; defaultProbabilityPercent: number; isTerminal: boolean }>([
      [
        "stage-1",
        {
          id: "stage-1",
          pipelineId: "pipe-1",
          name: "التأهيل",
          slug: "qualification",
          stageKey: "qualification",
          sortOrder: 0,
          defaultProbabilityPercent: 10,
          isTerminal: false,
        },
      ],
    ]);

    const label = translateOpportunityProbabilityReason(
      "Seeded from stage Qualification after lead qualification",
      (key, opts) =>
        key === "opportunities360.probabilityReason.seededFromStage"
          ? `مشتق من مرحلة ${opts?.stage}`
          : key,
      stageById,
    );
    assert.equal(label, "مشتق من مرحلة التأهيل");
  });
});
