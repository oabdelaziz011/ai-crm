import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateTokenUsage, isProviderReportedTokenUsage } from "./execution-utils.js";

describe("estimateTokenUsage", () => {
  it("still estimates tokens for non-commercial diagnostics", () => {
    const usage = estimateTokenUsage("abcd", "abcdefgh");
    assert.equal(usage.prompt_tokens, 1);
    assert.equal(usage.completion_tokens, 2);
    assert.equal(usage.total_tokens, 3);
    assert.equal("source" in usage, false);
    assert.equal(isProviderReportedTokenUsage(usage), false);
  });

  it("accepts only provider-reported usage with total_tokens > 0", () => {
    assert.equal(
      isProviderReportedTokenUsage({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
        source: "provider",
      }),
      true,
    );
    assert.equal(
      isProviderReportedTokenUsage({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      }),
      false,
    );
    assert.equal(
      isProviderReportedTokenUsage({
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        source: "provider",
      }),
      false,
    );
  });
});
