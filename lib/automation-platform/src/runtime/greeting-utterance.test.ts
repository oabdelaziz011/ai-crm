import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildIntentReentryStartVariables,
  isClarifyIntentPrompt,
  isGreetingOnlyUtterance,
  promptAfterGreetingOnlyInput,
} from "./greeting-utterance.js";

describe("isGreetingOnlyUtterance", () => {
  it("detects Arabic and English greeting-only text", () => {
    for (const text of ["مرحبا", "مرحباً", "هالو", "هاي", "اهلا", "أهلا بيك", "السلام عليكم", "صباح الخير", "hello", "hi", "hey", "Hi!"]) {
      assert.equal(isGreetingOnlyUtterance(text), true, text);
    }
  });

  it("does not treat real intents as greetings", () => {
    for (const text of ["عايز أحجز", "مرحبا عايز أحجز", "حجز", "pricing", "hello I want to book", "وضح السعر"]) {
      assert.equal(isGreetingOnlyUtterance(text), false, text);
    }
  });
});

describe("promptAfterGreetingOnlyInput", () => {
  it("replaces clarify prompts for customer_intent with a help ask", () => {
    assert.equal(isClarifyIntentPrompt("وضح طلبك لو سمحت"), true);
    assert.equal(
      promptAfterGreetingOnlyInput({
        currentPrompt: "وضح طلبك لو سمحت",
        language: "ar",
        inputKey: "customer_intent",
      }),
      "اهلا بيك يا فندم اقدر اساعدك ازاي ؟",
    );
  });

  it("keeps a friendly intent prompt and other field questions", () => {
    assert.equal(
      promptAfterGreetingOnlyInput({
        currentPrompt: "اهلا بيك يا فندم اقدر اساعدك ازاي ؟",
        language: "ar",
        inputKey: "customer_intent",
      }),
      "اهلا بيك يا فندم اقدر اساعدك ازاي ؟",
    );
    assert.equal(
      promptAfterGreetingOnlyInput({
        currentPrompt: "ما هو اسمك؟",
        language: "ar",
        inputKey: "customer_name",
      }),
      "ما هو اسمك؟",
    );
  });
});

describe("buildIntentReentryStartVariables", () => {
  it("skips greeting-only reentry so welcome is sent again", () => {
    assert.equal(buildIntentReentryStartVariables("مرحبا"), null);
    assert.equal(buildIntentReentryStartVariables("هالو"), null);
  });

  it("consumes a real intent after a finished session", () => {
    const vars = buildIntentReentryStartVariables("عايز أحجز");
    assert.ok(vars);
    assert.equal(vars.customer_intent, "عايز أحجز");
    assert.equal(vars.__reentrySkipWelcome, true);
    assert.equal(vars.__reentryConsumeIntent, true);
  });
});
