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

  it("maps empty-doctor recovery choices before generic book aliases", () => {
    assert.equal(resolveFreeTextSelectionId("نحجز مع دكتور تاني"), "another_doctor");
    assert.equal(resolveFreeTextSelectionId("ننهي المحادثة"), "end_chat");
    assert.equal(canonicalizeSelectionId("another_doctor", "نحجز مع دكتور تاني"), "another_doctor");
    assert.equal(canonicalizeSelectionId("end_chat", "ننهي المحادثة"), "end_chat");
  });

  it("maps book/support aliases", () => {
    assert.equal(resolveFreeTextSelectionId("عايز أحجز"), "book");
    assert.equal(resolveFreeTextSelectionId("دعم"), "support");
  });

  it("maps cancel free-text before book aliases", () => {
    assert.equal(resolveFreeTextSelectionId("عايزه الغي ميعاد كشف"), "cancel");
    assert.equal(resolveFreeTextSelectionId("الغي الحجز"), "cancel");
    assert.equal(resolveFreeTextSelectionId("cancel appointment"), "cancel");
  });

  it("returns null for unrelated free text", () => {
    assert.equal(resolveFreeTextSelectionId("مرحبا"), null);
    assert.equal(resolveFreeTextSelectionId("وضح طلبك"), null);
  });

  it("canonicalizes button titles to stable ids", () => {
    assert.equal(canonicalizeSelectionId(null, "الأسعار"), "pricing");
    assert.equal(canonicalizeSelectionId("pricing", "Pricing"), "pricing");
  });

  it("preserves explicit cancellation confirmation reply ids", () => {
    assert.equal(
      canonicalizeSelectionId("confirm_cancel", "تأكيد الإلغاء"),
      "confirm_cancel",
    );
    assert.equal(
      canonicalizeSelectionId("keep_booking", "الاحتفاظ بالميعاد"),
      "keep_booking",
    );
  });
});
