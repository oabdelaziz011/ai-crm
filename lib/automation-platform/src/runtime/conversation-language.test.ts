import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalizeSelectionId } from "./bilingual-selection-aliases.js";
import {
  detectConversationLanguage,
  ensureConversationLanguage,
  normalizeConversationLanguage,
} from "./conversation-language.js";
import { localizeNodeConfigForLanguage } from "./localize-node-config.js";
import { extractInteractiveSelection } from "./conversation-variables.js";

describe("conversation language", () => {
  it("detects Arabic script as ar and Latin as en", () => {
    assert.equal(detectConversationLanguage("عايز أحجز"), "ar");
    assert.equal(detectConversationLanguage("I want to book"), "en");
    assert.equal(detectConversationLanguage("   "), null);
  });

  it("sets language once and keeps it stable", () => {
    const first = ensureConversationLanguage({}, { text: "مرحبا" });
    assert.equal((first.conversation as { language: string }).language, "ar");
    const second = ensureConversationLanguage(first, { text: "hello again" });
    assert.equal((second.conversation as { language: string }).language, "ar");
  });

  it("allows explicit language button override", () => {
    const seeded = ensureConversationLanguage({}, { text: "مرحبا" });
    const forced = ensureConversationLanguage(seeded, { selectionId: "lang_en" });
    assert.equal((forced.conversation as { language: string }).language, "en");
  });

  it("normalizes language codes", () => {
    assert.equal(normalizeConversationLanguage("Arabic"), "ar");
    assert.equal(normalizeConversationLanguage("en-US"), "en");
  });
});

describe("bilingual selection aliases", () => {
  it("maps Arabic and English titles to stable ids", () => {
    assert.equal(canonicalizeSelectionId("حجز", "حجز"), "book");
    assert.equal(canonicalizeSelectionId(null, "Book Appointment"), "book");
    assert.equal(canonicalizeSelectionId("book", "Book Appointment"), "book");
    assert.equal(canonicalizeSelectionId("booking", "Book now"), "booking");
    assert.equal(canonicalizeSelectionId("ذكر", "ذكر"), "male");
  });

  it("extractInteractiveSelection canonicalizes aliases", () => {
    const selection = extractInteractiveSelection({
      replyId: "حجز",
      title: "حجز",
      interactionType: "button",
    });
    assert.equal(selection?.last_button_id, "book");
    assert.equal(selection?.last_button_title, "حجز");
  });
});

describe("localize node config", () => {
  it("picks Arabic or English copy from bilingual fields", () => {
    const config = {
      action: "send_buttons",
      message: "Choose",
      messages: { ar: "اختر", en: "Choose an option" },
      buttons: [
        { id: "book", label: "Book", labelAr: "حجز", labelEn: "Book" },
      ],
    };
    const ar = localizeNodeConfigForLanguage(config, "ar");
    assert.equal(ar.message, "اختر");
    assert.equal((ar.buttons as Array<{ label: string }>)[0]?.label, "حجز");
    const en = localizeNodeConfigForLanguage(config, "en");
    assert.equal(en.message, "Choose an option");
  });

  it("keeps spaces in bilingual button labels and prefers them over stale base", () => {
    const config = {
      action: "send_buttons",
      message: "Choose",
      messages: { ar: "من فضلك اختَر", en: "Please choose" },
      buttons: [
        {
          id: "book",
          label: "Book",
          labelAr: "حجز موعد",
          labelEn: "Book now",
        },
      ],
    };
    const ar = localizeNodeConfigForLanguage(config, "ar");
    assert.equal((ar.buttons as Array<{ label: string }>)[0]?.label, "حجز موعد");
    const en = localizeNodeConfigForLanguage(config, "en");
    assert.equal((en.buttons as Array<{ label: string }>)[0]?.label, "Book now");
    const unset = localizeNodeConfigForLanguage(config, null);
    assert.equal((unset.buttons as Array<{ label: string }>)[0]?.label, "حجز موعد");
  });

  it("localizes ask/date prompts into prompt and question fields", () => {
    const config = {
      action: "wait_for_input",
      prompt: "Name?",
      questions: { ar: "ما اسمك؟", en: "What is your name?" },
    };
    const ar = localizeNodeConfigForLanguage(config, "ar");
    assert.equal(ar.prompt, "ما اسمك؟");
    assert.equal(ar.question, "ما اسمك؟");
  });
});
