import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  localizeLeadChannel,
  localizeLeadIntent,
  localizeLeadTaskStatus,
  localizeOpportunityPipelineName,
  localizeOpportunityStageName,
} from "./lead360-localize.ts";

const STRINGS: Record<string, string> = {
  "opportunities.stages.qualification": "التأهيل",
  "opportunities.pipelines.salesExecution": "تنفيذ المبيعات",
  "leads360.channels.email": "بريد إلكتروني",
  "leads360.taskStatus.open": "مفتوحة",
  "leads360.intents.pricingInquiry": "استفسار عن السعر",
};

const t = (key: string) => STRINGS[key] ?? key;

describe("lead360-localize", () => {
  it("translates default opportunity stage and pipeline names", () => {
    assert.equal(localizeOpportunityStageName(t, "Qualification"), "التأهيل");
    assert.equal(localizeOpportunityPipelineName(t, "Sales Execution"), "تنفيذ المبيعات");
  });

  it("passes through custom names", () => {
    assert.equal(localizeOpportunityStageName(t, "Custom Stage"), "Custom Stage");
    assert.equal(localizeOpportunityPipelineName(t, "Enterprise Pipeline"), "Enterprise Pipeline");
  });

  it("translates channels, task status, and intents", () => {
    assert.equal(localizeLeadChannel(t, "email"), "بريد إلكتروني");
    assert.equal(localizeLeadTaskStatus(t, "open"), "مفتوحة");
    assert.equal(localizeLeadIntent(t, "Pricing Inquiry"), "استفسار عن السعر");
  });
});
