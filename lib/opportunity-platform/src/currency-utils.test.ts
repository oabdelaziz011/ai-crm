import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OpportunityValidationError } from "./errors.js";
import {
  resolveLeadOpportunityCurrency,
  resolveManualOpportunityCurrency,
} from "./currency-utils.js";

describe("opportunity currency resolution", () => {
  it("resolveManualOpportunityCurrency prefers explicit currency", () => {
    assert.equal(resolveManualOpportunityCurrency("SAR", "EGP"), "SAR");
  });

  it("resolveManualOpportunityCurrency falls back to company billing default", () => {
    assert.equal(resolveManualOpportunityCurrency(undefined, "EGP"), "EGP");
  });

  it("resolveManualOpportunityCurrency throws without explicit or company default", () => {
    assert.throws(
      () => resolveManualOpportunityCurrency(undefined, undefined),
      OpportunityValidationError,
    );
  });

  it("resolveLeadOpportunityCurrency keeps explicit non-USD lead currency", () => {
    assert.equal(resolveLeadOpportunityCurrency("SAR", "EGP"), "SAR");
  });

  it("resolveLeadOpportunityCurrency replaces legacy USD with company default", () => {
    assert.equal(resolveLeadOpportunityCurrency("USD", "EGP"), "EGP");
  });

  it("resolveLeadOpportunityCurrency uses company default when lead currency missing", () => {
    assert.equal(resolveLeadOpportunityCurrency(null, "EGP"), "EGP");
  });
});
