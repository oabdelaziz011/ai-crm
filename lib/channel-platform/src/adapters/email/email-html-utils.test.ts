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

  it("preserves identity logo img for outbound/inbound HTML", () => {
    const html =
      '<p>Hello</p><div data-email-identity-logo="1"><img src="https://cdn.example/logo.png" alt="" width="160" /></div><p>Sig</p>';
    const sanitized = sanitizeEmailHtml(html);
    assert.match(sanitized, /data-email-identity-logo/);
    assert.match(sanitized, /<img\b/i);
    assert.match(sanitized, /https:\/\/cdn\.example\/logo\.png/);
    assert.ok(sanitized.indexOf("Hello") < sanitized.indexOf("img"));
    assert.ok(sanitized.indexOf("img") < sanitized.indexOf("Sig"));
  });
});
