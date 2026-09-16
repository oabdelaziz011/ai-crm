/**
 * Client email message translation helpers — cache, detection, RTL, isolation.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMAIL_TRANSLATE_LANGUAGES,
  clearEmailTranslationCacheForTests,
  defaultEmailTranslateTargetLanguage,
  detectEmailMessageSourceLanguage,
  emailTranslateCacheKey,
  getCachedEmailTranslation,
  isRtlEmailTranslateLanguage,
  setCachedEmailTranslation,
} from "./email-message-translate-shared.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientSrc = readFileSync(join(__dirname, "email-message-translate.ts"), "utf8");
const sharedSrc = readFileSync(join(__dirname, "email-message-translate-shared.ts"), "utf8");
const controlSrc = readFileSync(
  join(__dirname, "../../components/email/email-message-translate-control.tsx"),
  "utf8",
);
const panelSrc = readFileSync(
  join(__dirname, "../../components/email/email-workspace-panel.tsx"),
  "utf8",
);
const enLocale = JSON.parse(
  readFileSync(join(__dirname, "../../locales/en/common.json"), "utf8"),
) as { emailModule: { workspace: { messageTranslation: Record<string, string> } } };
const arLocale = JSON.parse(
  readFileSync(join(__dirname, "../../locales/ar/common.json"), "utf8"),
) as { emailModule: { workspace: { messageTranslation: Record<string, string> } } };

describe("email-message-translate client helpers", () => {
  beforeEach(() => {
    clearEmailTranslationCacheForTests();
  });

  it("offers French, German, and Spanish as first-class translate targets", () => {
    const codes = EMAIL_TRANSLATE_LANGUAGES.map((row) => row.code);
    assert.ok(codes.includes("fr"));
    assert.ok(codes.includes("de"));
    assert.ok(codes.includes("es"));
    assert.equal(isRtlEmailTranslateLanguage("fr"), false);
    assert.equal(isRtlEmailTranslateLanguage("de"), false);
    assert.equal(isRtlEmailTranslateLanguage("es"), false);
  });

  it("detects French, German, and Spanish source text", () => {
    assert.equal(
      detectEmailMessageSourceLanguage(
        "Bonjour, merci beaucoup pour votre message. Pouvez-vous confirmer la commande demain s'il vous plait?",
      ).code,
      "fr",
    );
    assert.equal(
      detectEmailMessageSourceLanguage(
        "Guten Tag, vielen Dank für Ihre Nachricht. Bitte senden Sie uns die Rechnung so schnell wie möglich.",
      ).code,
      "de",
    );
    assert.equal(
      detectEmailMessageSourceLanguage(
        "Hola, gracias por su mensaje. Por favor envienos la factura para el pedido lo antes posible.",
      ).code,
      "es",
    );
  });

  it("detects English and defaults target to Arabic", () => {
    const detected = detectEmailMessageSourceLanguage(
      "Hello, please send the invoice for order ORD-42 as soon as possible.",
    );
    assert.equal(detected.code, "en");
    assert.equal(defaultEmailTranslateTargetLanguage(detected.code), "ar");
  });

  it("detects Arabic and defaults target to English", () => {
    const detected = detectEmailMessageSourceLanguage(
      "مرحبا، أرجو إرسال الفاتورة الخاصة بالطلب في أقرب وقت ممكن شكراً",
    );
    assert.equal(detected.code, "ar");
    assert.equal(defaultEmailTranslateTargetLanguage(detected.code), "en");
  });

  it("caches by messageId + targetLanguage", () => {
    assert.equal(emailTranslateCacheKey("msg1", "AR"), "msg1:ar");
    setCachedEmailTranslation("msg1", "ar", {
      sourceLanguage: "en",
      sourceLanguageLabel: "English",
      targetLanguage: "ar",
      translatedText: "مرحبا",
      truncated: false,
      neverSend: true,
    });
    const hit = getCachedEmailTranslation("msg1", "ar");
    assert.ok(hit);
    assert.equal(hit.translatedText, "مرحبا");
    assert.equal(getCachedEmailTranslation("msg1", "de"), null);
  });

  it("marks Arabic RTL and English LTR", () => {
    assert.equal(isRtlEmailTranslateLanguage("ar"), true);
    assert.equal(isRtlEmailTranslateLanguage("en"), false);
    assert.equal(isRtlEmailTranslateLanguage("de"), false);
  });
});

describe("email-message-translate UI wiring", () => {
  it("shows translate only for incoming messages in the workspace panel", () => {
    assert.match(panelSrc, /EmailMessageTranslateControl/);
    assert.match(panelSrc, /incoming && companyId && canTranslateIncomingMessages/);
    assert.match(panelSrc, /ai\.conversations\.reply/);
    assert.match(panelSrc, /ai_assistant/);
  });

  it("does not present translate as an outbound send action", () => {
    assert.match(controlSrc, /data-email-translate-never-send/);
    assert.doesNotMatch(controlSrc, /sendReply|dispatchOutbound|createDelivery/);
    assert.doesNotMatch(clientSrc, /\/email\/ai\/draft/);
    assert.doesNotMatch(sharedSrc, /\/email\/ai\/draft/);
    assert.match(clientSrc, /\/email\/messages\/\$\{encodeURIComponent\(input\.messageId\)\}\/translate/);
  });

  it("result block sets dir rtl/ltr from target language", () => {
    assert.match(controlSrc, /data-dir=\{state\.resultRtl \? "rtl" : "ltr"\}/);
    assert.match(controlSrc, /max-h-48 overflow-y-auto/);
  });

  it("locales include translation strings in EN and AR", () => {
    const en = enLocale.emailModule.workspace.messageTranslation;
    const ar = arLocale.emailModule.workspace.messageTranslation;
    for (const key of [
      "translate",
      "hide",
      "popoverTitle",
      "sourceLanguage",
      "targetLanguage",
      "error",
      "retry",
      "copy",
      "resultTitle",
    ] as const) {
      assert.ok(en[key], `missing en key ${key}`);
      assert.ok(ar[key], `missing ar key ${key}`);
      assert.doesNotMatch(en[key], /emailModule\./);
      assert.doesNotMatch(ar[key], /emailModule\./);
    }
    assert.equal(en.error, "Unable to translate this message. Please try again.");
    assert.equal(ar.error, "تعذر ترجمة الرسالة. حاول مرة أخرى.");
    assert.equal(ar.translate, "ترجمة");
  });
});
