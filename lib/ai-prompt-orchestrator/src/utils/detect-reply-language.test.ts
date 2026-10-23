import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyTemplateSectionOverrides } from "../utils/compose-prompt.js";
import { detectReplyLanguage } from "../utils/detect-reply-language.js";
import type { PromptTemplateVersionRecord } from "../types.js";

describe("detectReplyLanguage", () => {
  it("detects Arabic script", () => {
    assert.equal(detectReplyLanguage("ازيك"), "Arabic");
    assert.equal(detectReplyLanguage("مرحبا، محتاج موعد"), "Arabic");
  });

  it("defaults to English for Latin script", () => {
    assert.equal(detectReplyLanguage("Hello"), "English");
    assert.equal(detectReplyLanguage("hi"), "English");
  });

  it("detects German and keeps the previous language for a short follow-up", () => {
    assert.equal(detectReplyLanguage("Welche Termine sind morgen frei?"), "German");
    assert.equal(detectReplyLanguage("Ist morgen um 10 Uhr ein Termin frei?"), "German");
    assert.equal(detectReplyLanguage("ok", ["ايه المواعيد المتاحة بكرة؟"]), "Arabic");
    assert.equal(detectReplyLanguage("OK", ["Welche Termine sind morgen frei?"]), "German");
    assert.equal(detectReplyLanguage("Ahmed Ali", ["What times are open tomorrow?"]), "English");
    assert.equal(detectReplyLanguage("Müller GmbH", ["What times are open tomorrow?"]), "English");
    assert.equal(detectReplyLanguage("Müller GmbH", ["Welche Termine sind morgen frei?"]), "German");
    assert.equal(detectReplyLanguage("Kopfhörer"), "English");
    assert.equal(
      detectReplyLanguage("Welche Termine sind morgen frei?", ["عايز أعرف المواعيد"]),
      "German",
    );
  });
});

describe("applyTemplateSectionOverrides language", () => {
  it("keeps runtime language over tenant English template", () => {
    const version = {
      id: "v1",
      template_id: "t1",
      version_number: 1,
      status: "published",
      sections: {
        language: {
          enabled: true,
          title: "Language",
          content: "Respond in English unless the user explicitly requests Arabic.",
        },
      },
      section_order: ["language"],
      output_contract: { format: "text", instructions: "", schema: null },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as PromptTemplateVersionRecord;

    const merged = applyTemplateSectionOverrides(
      {
        language: {
          key: "language",
          title: "Language",
          content: "CRITICAL LANGUAGE RULE: Reply only in Arabic.",
        },
      },
      version,
    );

    assert.equal(merged.language?.content, "CRITICAL LANGUAGE RULE: Reply only in Arabic.");
    assert.equal(merged.language?.content.includes("Respond in English"), false);
  });
});
