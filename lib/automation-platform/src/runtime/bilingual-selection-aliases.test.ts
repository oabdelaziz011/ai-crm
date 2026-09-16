import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeSelectionId,
  matchFreeTextToInteractiveOptions,
  resolveContinueLikeSelectionId,
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

  it("does not rewrite an explicit reply id from a title that contains another alias", () => {
    assert.equal(
      canonicalizeSelectionId("something_else", "اه عايزة اعرف اسعار الدكتور"),
      "something_else",
    );
  });

  it("scopes free-text aliases to the current menu options", () => {
    const followUp = [
      { id: "something_else", label: "حاجة تانية" },
      { id: "no", label: "خلاص، شكراً" },
    ];
    assert.equal(
      matchFreeTextToInteractiveOptions("اه عايزة اعرف اسعار الدكتور", followUp),
      null,
    );
    assert.equal(matchFreeTextToInteractiveOptions("حاجة تانية", followUp), "something_else");
    assert.equal(matchFreeTextToInteractiveOptions("خلاص", followUp), "no");
    assert.equal(resolveContinueLikeSelectionId(followUp), "something_else");

    const mainMenu = [
      { id: "pricing", label: "الأسعار" },
      { id: "book", label: "حجز" },
    ];
    assert.equal(matchFreeTextToInteractiveOptions("عايز اسعار الدكتور", mainMenu), "pricing");
  });
});
