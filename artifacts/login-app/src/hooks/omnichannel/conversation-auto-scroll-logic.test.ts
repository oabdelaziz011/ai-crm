import { describe, expect, it } from "vitest";
import {
  CONVERSATION_NEAR_BOTTOM_THRESHOLD_PX,
  detectMessageListChange,
  isNearScrollBottom,
} from "@/hooks/omnichannel/conversation-auto-scroll-logic";

describe("isNearScrollBottom", () => {
  it("returns true when within threshold of the bottom", () => {
    expect(isNearScrollBottom(900, 1000, 100, CONVERSATION_NEAR_BOTTOM_THRESHOLD_PX)).toBe(true);
  });

  it("returns false when scrolled away from the bottom", () => {
    expect(isNearScrollBottom(100, 1000, 100, CONVERSATION_NEAR_BOTTOM_THRESHOLD_PX)).toBe(false);
  });
});

describe("detectMessageListChange", () => {
  it("detects appended messages", () => {
    expect(detectMessageListChange(["a", "b"], ["a", "b", "c"])).toBe("append");
  });

  it("detects prepended history", () => {
    expect(detectMessageListChange(["b", "c"], ["a", "b", "c"])).toBe("prepend");
  });

  it("detects full replacement", () => {
    expect(detectMessageListChange(["a"], ["x", "y"])).toBe("replace");
  });

  it("returns none when ids are unchanged", () => {
    expect(detectMessageListChange(["a", "b"], ["a", "b"])).toBe("none");
  });
});
