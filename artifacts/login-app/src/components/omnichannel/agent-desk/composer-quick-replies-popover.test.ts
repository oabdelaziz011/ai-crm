import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isComposerQuickRepliesTriggerDisabled } from "@/components/omnichannel/agent-desk/composer-quick-replies-popover";

describe("composer quick replies trigger clickability", () => {
  it("stays enabled when composer send/reply is disabled", () => {
    assert.equal(isComposerQuickRepliesTriggerDisabled(true), false);
  });

  it("stays enabled when composer send/reply is enabled", () => {
    assert.equal(isComposerQuickRepliesTriggerDisabled(false), false);
  });

  it("stays enabled when composer disabled is omitted", () => {
    assert.equal(isComposerQuickRepliesTriggerDisabled(), false);
  });
});
