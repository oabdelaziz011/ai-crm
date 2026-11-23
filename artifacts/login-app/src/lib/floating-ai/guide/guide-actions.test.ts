import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatGuideNavigateAction,
  parseGuideActionJson,
  stripGuideActionsFromMessage,
} from "./guide-actions";

describe("Guide client action protocol", () => {
  it("parses navigate actions and strips them from display text", () => {
    const raw = `Open Customers next.\n${formatGuideNavigateAction("customers")}\nThanks.`;
    const { displayText, actions } = stripGuideActionsFromMessage(raw);
    assert.equal(actions.length, 1);
    assert.deepEqual(actions[0], { type: "navigate", routeId: "customers" });
    assert.match(displayText, /Open Customers/);
    assert.doesNotMatch(displayText, /valueor-guide/);
    assert.doesNotMatch(displayText, /customers"/);
  });

  it("rejects malformed action JSON", () => {
    assert.equal(parseGuideActionJson("{not-json"), null);
    assert.equal(parseGuideActionJson(JSON.stringify({ type: "navigate" })), null);
  });
});
