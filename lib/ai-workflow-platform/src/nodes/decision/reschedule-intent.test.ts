import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { looksLikeExplicitRescheduleIntent } from "./reschedule-intent.js";
import { validateDecisionResult } from "./result-validator.js";
import type { DecisionConfidencePolicy, DecisionOutcome } from "./types.js";

const POLICY: DecisionConfidencePolicy = {
  minimumConfidence: 0.55,
  fallbackOutcomeId: "other",
  retryOnce: false,
  requireHumanReview: false,
  emitWarning: true,
  continueWorkflow: true,
};

const CLINIC_OUTCOMES: DecisionOutcome[] = [
  {
    id: "pricing",
    label: "pricing",
    examples: ["أسعار", "اسعار", "تكلفة", "كام السعر"],
    description: "Customer asks about prices",
  },
  {
    id: "reschedule",
    label: "reschedule",
    examples: ["تغيير الموعد", "عايزة أغير الموعد", "reschedule", "change my appointment"],
    description: "Customer wants to change or reschedule an existing appointment / تغيير الموعد",
  },
  {
    id: "finance",
    label: "finance",
    examples: ["حجز", "موعد", "احجز", "عايز أحجز", "حجز موعد", "book"],
    description: "Customer wants to book an appointment / حجز موعد",
  },
  {
    id: "cancel",
    label: "cancel",
    examples: ["الغي الموعد", "cancel my booking"],
    description: "Customer wants to cancel an existing appointment",
  },
  { id: "other", label: "other", examples: ["hello"], description: "Unclear" },
];

function classify(text: string): string {
  return validateDecisionResult(CLINIC_OUTCOMES, POLICY, 0.55, { label: text, confidence: 1 }).value.label;
}

describe("explicit reschedule intent detection", () => {
  it("detects Arabic change + appointment/booking context", () => {
    assert.equal(looksLikeExplicitRescheduleIntent("عايزة أغير موعد الحجز"), true);
    assert.equal(looksLikeExplicitRescheduleIntent("عايزة أغير الموعد"), true);
    assert.equal(looksLikeExplicitRescheduleIntent("تغيير الموعد"), true);
    assert.equal(looksLikeExplicitRescheduleIntent("أريد تغيير موعدي"), true);
    assert.equal(looksLikeExplicitRescheduleIntent("ممكن أعدل الحجز؟"), true);
    assert.equal(looksLikeExplicitRescheduleIntent("إعادة جدولة الموعد"), true);
    assert.equal(looksLikeExplicitRescheduleIntent("أعد جدولة الحجز"), true);
    assert.equal(looksLikeExplicitRescheduleIntent("عايز أأجل الحجز"), true);
    assert.equal(looksLikeExplicitRescheduleIntent("ممكن نغير الموعد؟"), true);
  });

  it("detects English reschedule/change with appointment context", () => {
    assert.equal(looksLikeExplicitRescheduleIntent("reschedule"), true);
    assert.equal(looksLikeExplicitRescheduleIntent("reschedule my appointment"), true);
    assert.equal(looksLikeExplicitRescheduleIntent("change my booking"), true);
    assert.equal(looksLikeExplicitRescheduleIntent("I want to change my appointment"), true);
    assert.equal(looksLikeExplicitRescheduleIntent("change"), false);
    assert.equal(looksLikeExplicitRescheduleIntent("move"), false);
  });

  it("does not treat generic booking phrases or availability as reschedule", () => {
    assert.equal(looksLikeExplicitRescheduleIntent("حجز"), false);
    assert.equal(looksLikeExplicitRescheduleIntent("موعد"), false);
    assert.equal(looksLikeExplicitRescheduleIntent("عايزة أحجز"), false);
    assert.equal(looksLikeExplicitRescheduleIntent("عايزة أحجز موعد"), false);
    assert.equal(looksLikeExplicitRescheduleIntent("غير متاح"), false);
    assert.equal(looksLikeExplicitRescheduleIntent("الموعد غير متاح"), false);
    assert.equal(looksLikeExplicitRescheduleIntent("هل يوجد موعد؟"), false);
    assert.equal(looksLikeExplicitRescheduleIntent("عايزة أعرف مواعيد العيادة"), false);
    assert.equal(looksLikeExplicitRescheduleIntent("عايزة أعرف تفاصيل الحجز"), false);
  });
});

describe("AI Decision fallback reschedule vs finance", () => {
  it("classifies explicit Arabic/English reschedule phrases as reschedule", () => {
    for (const phrase of [
      "عايزة أغير موعد الحجز",
      "عايزة أغير الموعد",
      "عايز أغير الموعد",
      "عايز أغير موعد الحجز",
      "تغيير الموعد",
      "أريد تغيير موعدي",
      "عايزة أعدل الموعد",
      "عايز أعدل الحجز",
      "ممكن أعدل الحجز؟",
      "ممكن أغير ميعاد الحجز؟",
      "ممكن نغير الموعد؟",
      "إعادة جدولة الموعد",
      "أعد جدولة الحجز",
      "إعادة حجز الموعد",
      "عايزة أأجل الموعد",
      "عايز أأجل الحجز",
      "reschedule",
      "reschedule my appointment",
      "reschedule my booking",
      "change my appointment",
      "change my booking",
      "change the appointment",
      "change the booking",
      "I want to change my appointment",
    ]) {
      assert.equal(classify(phrase), "reschedule", phrase);
    }
  });

  it("keeps generic new-booking phrases on finance", () => {
    for (const phrase of [
      "حجز",
      "عايزة أحجز",
      "عايز أحجز",
      "موعد",
      "عايزة موعد",
      "عايز موعد",
      "عايزة أحجز موعد",
      "حجز جديد",
      "أريد حجز موعد",
      "book an appointment",
      "new booking",
    ]) {
      assert.equal(classify(phrase), "finance", phrase);
    }
    // Existing fallback matching has no finance example that covers this phrase;
    // it must not become reschedule.
    assert.notEqual(classify("I want an appointment"), "reschedule");
  });

  it("does not classify ambiguous availability or inquiry phrases as reschedule", () => {
    assert.notEqual(classify("غير متاح"), "reschedule");
    assert.notEqual(classify("الموعد غير متاح"), "reschedule");
    assert.notEqual(classify("هل يوجد موعد؟"), "reschedule");
    assert.notEqual(classify("عايزة أعرف مواعيد العيادة"), "reschedule");
    assert.notEqual(classify("عايزة أعرف تفاصيل الحجز"), "reschedule");
  });

  it("does not invent a reschedule outcome when the workflow has none", () => {
    const withoutReschedule = CLINIC_OUTCOMES.filter((outcome) => outcome.id !== "reschedule");
    const result = validateDecisionResult(withoutReschedule, POLICY, 0.55, {
      label: "عايزة أغير موعد الحجز",
      confidence: 1,
    });
    assert.notEqual(result.value.label, "reschedule");
  });

  it("still prefers exact cancel examples over reschedule intent", () => {
    assert.equal(classify("الغي الموعد"), "cancel");
    assert.equal(classify("cancel my booking"), "cancel");
  });
});
