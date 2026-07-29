import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { htmlToPlainText, normalizeEmailMessageId, sanitizeEmailHtml } from "./email-html-utils.js";

describe("email html utils", () => {
  it("normalizes message ids", () => {
    assert.equal(normalizeEmailMessageId("<ABC@Example.com>"), "abc@example.com");
  });

  it("sanitizes dangerous html", () => {
    const sanitized = sanitizeEmailHtml('<p>Hello</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>');
    assert.match(sanitized, /Hello/);
    assert.doesNotMatch(sanitized, /script/);
    assert.doesNotMatch(sanitized, /javascript:/);
  });

  it("converts html to plain text", () => {
    const plain = htmlToPlainText("<p>Hello<br/>World</p>");
    assert.match(plain, /Hello/);
    assert.match(plain, /World/);
  });
});
