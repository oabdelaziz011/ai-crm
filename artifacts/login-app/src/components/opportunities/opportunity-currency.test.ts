import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setCompanyLocaleRuntime } from "@/lib/company-locale/runtime";
import { formatOpportunityMoney } from "./opportunity360-ui";

describe("formatOpportunityMoney", () => {
  it("formats using opportunity.currency only", () => {
    setCompanyLocaleRuntime({ currency: "EGP", intlLocale: "en-US" });
    const formatted = formatOpportunityMoney(2500, "USD");
    assert.match(formatted, /\$/);
    assert.doesNotMatch(formatted, /EGP|E£/);
  });

  it("does not fall back to company billing default when opportunity currency is missing", () => {
    setCompanyLocaleRuntime({ currency: "EGP", intlLocale: "en-US" });
    assert.equal(formatOpportunityMoney(2500, null), "");
    assert.equal(formatOpportunityMoney(2500, ""), "");
    assert.equal(formatOpportunityMoney(2500, "   "), "");
  });
});

describe("quote360 money formatter contract", () => {
  it("uses explicit quote currency when provided", () => {
    setCompanyLocaleRuntime({ currency: "EGP", intlLocale: "en-US" });
    const formatted = formatOpportunityMoney(1000, "USD");
    assert.match(formatted, /\$/);
    assert.doesNotMatch(formatted, /EGP|E£/);
  });
});
