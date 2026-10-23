import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderLinkedTextHtml, splitTextLinks } from "./linkify-text.ts";

describe("linkify text", () => {
  it("keeps a maps address as a link without the trailing period", () => {
    const url = "https://www.google.com/maps/search/?api=1&query=Commercial+Registry+28+Ramses+Street+Cairo";
    const parts = splitTextLinks(`العنوان: ${url}.`);
    assert.deepEqual(
      parts.filter((part) => part.href),
      [{ text: url, href: url }],
    );
    const html = renderLinkedTextHtml(`العنوان: ${url}.`);
    assert.match(html, /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=/);
    assert.match(html, /color:#2563eb/);
  });
});
