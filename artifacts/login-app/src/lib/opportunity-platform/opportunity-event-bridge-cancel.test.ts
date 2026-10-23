import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { opportunityFollowUpCancelReason } from "./opportunity-follow-up-cancel.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

describe("opportunity won/lost → sales follow-up cancel ownership", () => {
  it("maps lifecycle events to cancel reasons used by the login-app bridge only", () => {
    assert.equal(opportunityFollowUpCancelReason("won"), "opportunity_won");
    assert.equal(opportunityFollowUpCancelReason("lost"), "opportunity_lost");
  });

  it("documents that API server has no Opportunity lifecycle write path for cancel", () => {
    // Guardrail: api-server must not own mark-won/mark-lost writes. Product interest and
    // message compose only *read* won_at/lost_at. Cancellation is wired exclusively through
    // createOpportunityEventBridge in the login-app opportunity platform factory.
    const bridge = readFileSync(
      resolve(root, "artifacts/login-app/src/lib/opportunity-platform/opportunity-platform-factory.ts"),
      "utf8",
    );
    assert.match(bridge, /cancelSalesFollowUpsAfterOpportunityLifecycle/);
    assert.match(bridge, /publishWon/);
    assert.match(bridge, /publishLost/);

    const apiInterest = readFileSync(
      resolve(root, "artifacts/api-server/src/platform/webhook-product-interest-bridge.ts"),
      "utf8",
    );
    assert.doesNotMatch(apiInterest, /publishWon|publishLost|cancelSalesFollowUpForOpportunity/);
  });
});
