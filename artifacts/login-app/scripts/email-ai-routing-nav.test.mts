import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isEmailNavRouteVisible } from "../src/lib/email-routing/email-nav-visibility.ts";

describe("isEmailNavRouteVisible (Sprint 7)", () => {
  it("shows AI Routing under Email only when entitled to ai_email_routing", () => {
    assert.equal(
      isEmailNavRouteVisible(
        { commercialFeatureCode: "ai_email_routing" },
        (code) => code === "ai_email_routing",
      ),
      true,
    );
  });

  it("hides AI Routing when company is not entitled", () => {
    assert.equal(
      isEmailNavRouteVisible({ commercialFeatureCode: "ai_email_routing" }, () => false),
      false,
    );
  });

  it("hides AI Routing while entitlement is unresolved", () => {
    assert.equal(
      isEmailNavRouteVisible({ commercialFeatureCode: "ai_email_routing" }, () => undefined),
      false,
    );
  });

  it("keeps non-gated Email routes visible", () => {
    assert.equal(isEmailNavRouteVisible({}, () => false), true);
  });
});
