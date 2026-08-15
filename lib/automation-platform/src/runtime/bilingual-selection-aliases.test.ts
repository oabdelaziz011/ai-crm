import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeSelectionId,
  resolveFreeTextSelectionId,
} from "./bilingual-selection-aliases.js";

describe("bilingual selection aliases", () => {
  it("maps pricing free-text phrases to pricing", () => {
    assert.equal(resolveFreeTextSelectionId("اسعار"), "pricing");
    assert.equal(resolveFreeTextSelectionId("أسعار وتكلفة"), "pricing");
    assert.equal(resolveFreeTextSelectionId("عايز اسعار وتكلفة"), "pricing");
    assert.equal(resolveFreeTextSelectionId("كام السعر"), "pricing");
    assert.equal(resolveFreeTextSelectionId("how much is the cost"), "pricing");
  });

  it("maps book/support aliases", () => {
    assert.equal(resolveFreeTextSelectionId("عايز أحجز"), "book");
    assert.equal(resolveFreeTextSelectionId("دعم"), "support");
  });

  it("returns null for unrelated free text", () => {
    assert.equal(resolveFreeTextSelectionId("مرحبا"), null);
    assert.equal(resolveFreeTextSelectionId("وضح طلبك"), null);
  });

  it("canonicalizes button titles to stable ids", () => {
    assert.equal(canonicalizeSelectionId(null, "الأسعار"), "pricing");
    assert.equal(canonicalizeSelectionId("pricing", "Pricing"), "pricing");
  });
});
