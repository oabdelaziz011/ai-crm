import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canOpenSubscriptionPaySurface,
  resolveSubscriptionPayHref,
} from "../src/lib/dashboard/resolve-subscription-pay-href.ts";

describe("resolveSubscriptionPayHref", () => {
  it("sends company.view users to company subscription tab", () => {
    const href = resolveSubscriptionPayHref({
      isSuperAdmin: false,
      hasPermission: (code) => code === "company.view",
    });
    assert.match(href, /company\?tab=subscription/);
  });

  it("sends billing.view_own-only users to company subscription when they have subscriptions.view", () => {
    const href = resolveSubscriptionPayHref({
      isSuperAdmin: false,
      hasPermission: (code) => code === "subscriptions.view" || code === "billing.view_own",
    });
    assert.match(href, /company\?tab=subscription/);
  });

  it("routes billing.view_own to company subscription (billing.view_own grants subscription view)", () => {
    const href = resolveSubscriptionPayHref({
      isSuperAdmin: false,
      hasPermission: (code) => code === "billing.view_own",
    });
    assert.match(href, /company\?tab=subscription/);
  });

  it("canOpenSubscriptionPaySurface is true for billing.view_own", () => {
    assert.equal(
      canOpenSubscriptionPaySurface({
        isSuperAdmin: false,
        hasPermission: (code) => code === "billing.view_own",
      }),
      true,
    );
  });
});
