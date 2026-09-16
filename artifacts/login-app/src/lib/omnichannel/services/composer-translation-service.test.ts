import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  stripInternalTranslationMarkers,
  translateMessageForDisplay,
} from "./message-translation-display.ts";
import {
  detectComposerLanguage,
  insertBelowDraft,
  translateComposerDraft,
  validateComposerTranslationOutput,
} from "./composer-translation-service.ts";

describe("composer translation corruption fix", () => {
  it("Arabic → English produces only translated text (no markers)", () => {
    const result = translateComposerDraft({
      text: "أفهم استفسارك، اسمح لي أتحقق من ذلك.",
      target: "en",
    });
    assert.equal(result.source, "ar");
    assert.match(result.translated, /I understand/i);
    assert.doesNotMatch(result.translated, /\[Translation\]/i);
    assert.doesNotMatch(result.translated, /ترجمة/);
  });

  it("English → Arabic produces only translated text (no markers)", () => {
    const result = translateComposerDraft({
      text: "I understand your question. Let me check that for you.",
      target: "ar",
    });
    assert.equal(result.source, "en");
    assert.match(result.translated, /أفهم|استفسار|أتحقق/);
    assert.doesNotMatch(result.translated, /\[Translation\]/i);
    assert.doesNotMatch(result.translated, /\[ترجمة\]/);
  });

  it("never emits [Translation] from display translator fallback", () => {
    const out = translateMessageForDisplay(
      "نص غير موجود في خريطة العبارات بالكامل xyz",
      "ar",
      "en",
    );
    assert.doesNotMatch(out, /\[Translation\]/i);
    assert.doesNotMatch(out, /\[ترجمة\]/);
  });

  it("strips repeated [Translation] markers without recursive growth", () => {
    const corrupted =
      "[Translation] [Translation] [Translation] أفهم استفسارك، اسمح لي أتحقق من ذلك.";
    const cleaned = stripInternalTranslationMarkers(corrupted);
    assert.doesNotMatch(cleaned, /\[Translation\]/i);
    const once = translateComposerDraft({ text: corrupted, target: "en" });
    const twice = translateComposerDraft({ text: once.translated, target: "en" });
    assert.doesNotMatch(once.translated, /\[Translation\]/i);
    assert.equal(once.translated, twice.translated);
  });

  it("preserves mention tokens", () => {
    const result = translateComposerDraft({
      text: "أفهم استفسارك @ddd @OmarAbdelaziz",
      target: "en",
    });
    assert.match(result.translated, /@ddd/);
    assert.match(result.translated, /@OmarAbdelaziz/);
    assert.doesNotMatch(result.translated, /\[Translation\]/i);
  });

  it("rejects malformed JSON/provider wrappers", () => {
    assert.equal(
      validateComposerTranslationOutput('{"debug":true,"model":"x"}', "hello"),
      null,
    );
    assert.equal(
      validateComposerTranslationOutput("[Translation] [Translation]", "hello"),
      null,
    );
    assert.equal(
      validateComposerTranslationOutput(
        JSON.stringify({ translatedText: "Hello there" }),
        "مرحبا",
      ),
      "Hello there",
    );
  });

  it("insertBelow does not reintroduce markers", () => {
    const next = insertBelowDraft(
      "Original draft",
      "[Translation] Clean English text",
    );
    assert.equal(next, "Original draft\n\nClean English text");
  });

  it("detects source language independently from target", () => {
    assert.equal(detectComposerLanguage("Hello world"), "en");
    assert.equal(detectComposerLanguage("مرحبا بك"), "ar");
    assert.equal(
      translateComposerDraft({ text: "Hello", target: "en" }).translated,
      "Hello",
    );
  });
});
