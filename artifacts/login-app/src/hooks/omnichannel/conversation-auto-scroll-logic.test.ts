import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONVERSATION_NEAR_BOTTOM_THRESHOLD_PX,
  detectMessageListChange,
  isNearScrollBottom,
} from "./conversation-auto-scroll-logic.js";

describe("isNearScrollBottom", () => {
  it("returns true when within threshold of the bottom", () => {
    assert.equal(
      isNearScrollBottom(900, 1000, 100, CONVERSATION_NEAR_BOTTOM_THRESHOLD_PX),
      true,
    );
  });

  it("returns false when scrolled away from the bottom", () => {
    assert.equal(isNearScrollBottom(100, 1000, 100, CONVERSATION_NEAR_BOTTOM_THRESHOLD_PX), false);
  });
});

describe("detectMessageListChange", () => {
  it("detects appended messages", () => {
    assert.equal(detectMessageListChange(["a", "b"], ["a", "b", "c"]), "append");
  });

  it("detects prepended history", () => {
    assert.equal(detectMessageListChange(["b", "c"], ["a", "b", "c"]), "prepend");
  });

  it("detects full replacement", () => {
    assert.equal(detectMessageListChange(["a"], ["x", "y"]), "replace");
  });

  it("returns none when ids are unchanged", () => {
    assert.equal(detectMessageListChange(["a", "b"], ["a", "b"]), "none");
  });

  it("treats reorder/refetch with overlapping ids as replace (scroll must not force-jump)", () => {
    assert.equal(detectMessageListChange(["a", "b", "c"], ["a", "c", "b"]), "replace");
  });
});
