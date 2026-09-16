/**
 * Email message translation — unit tests (detection, extract, parse, isolation).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMAIL_MESSAGE_TRANSLATE_FEATURE_CODE,
  EMAIL_MESSAGE_TRANSLATE_PERMISSION,
  EMAIL_TRANSLATE_MAX_INPUT_CHARS,
  buildEmailTranslateSystemPrompt,
  defaultEmailTranslateTarget,
  detectEmailSourceLanguage,
  extractIncomingEmailBodyForTranslation,
  htmlToTranslatePlainText,
  languageDisplayName,
  parseEmailTranslateOutput,
} from "./email-message-translate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceSrc = readFileSync(join(__dirname, "email-message-translate.ts"), "utf8");

describe("email-message-translate detection", () => {
  it("detects English from latin content", () => {
    const detected = detectEmailSourceLanguage(
      "Hello, I would like to know more about your services and pricing options available this week.",
    );
    assert.equal(detected.code, "en");
    assert.equal(detected.confident, true);
  });

  it("detects Arabic from Arabic script", () => {
    const detected = detectEmailSourceLanguage(
      "مرحباً، أود معرفة المزيد عن خدماتكم والأسعار المتاحة لديكم حالياً شكراً جزيلاً",
    );
    assert.equal(detected.code, "ar");
    assert.equal(detected.confident, true);
  });

  it("returns unknown for tiny / empty samples", () => {
    assert.equal(detectEmailSourceLanguage("").code, "unknown");
    assert.equal(detectEmailSourceLanguage("hi").code, "unknown");
  });
});

describe("email-message-translate default target", () => {
  it("defaults to Arabic when source is not Arabic", () => {
    assert.equal(defaultEmailTranslateTarget("en"), "ar");
    assert.equal(defaultEmailTranslateTarget("unknown"), "ar");
    assert.equal(defaultEmailTranslateTarget("fr"), "ar");
  });

  it("defaults to English when source is Arabic", () => {
    assert.equal(defaultEmailTranslateTarget("ar"), "en");
  });
});

describe("email-message-translate extraction", () => {
  it("strips HTML and preserves paragraph breaks", () => {
    const text = htmlToTranslatePlainText(
      "<p>Hello</p><script>evil()</script><p>World</p><br/>Thanks",
    );
    assert.match(text, /Hello/);
    assert.match(text, /World/);
    assert.doesNotMatch(text, /evil|script/i);
  });

  it("omits quoted history after On … wrote", () => {
    const { text } = extractIncomingEmailBodyForTranslation({
      plainContent:
        "Please confirm the order ORD-9988 tomorrow.\n\nOn Mon, Jane wrote:\n> older thread body that should not be translated",
    });
    assert.match(text, /ORD-9988/);
    assert.doesNotMatch(text, /older thread/);
  });

  it("truncates very long content and marks truncated", () => {
    const long = "A".repeat(EMAIL_TRANSLATE_MAX_INPUT_CHARS + 500);
    const { text, truncated } = extractIncomingEmailBodyForTranslation({
      plainContent: long,
    });
    assert.equal(truncated, true);
    assert.ok(text.length <= EMAIL_TRANSLATE_MAX_INPUT_CHARS);
  });

  it("preserves urls and emails in plain extraction", () => {
    const { text } = extractIncomingEmailBodyForTranslation({
      plainContent:
        "Visit https://valueor.example/pricing and email support@valueor.com about REF-12345.",
    });
    assert.match(text, /https:\/\/valueor\.example\/pricing/);
    assert.match(text, /support@valueor\.com/);
    assert.match(text, /REF-12345/);
  });
});

describe("email-message-translate parse", () => {
  it("parses JSON translation output", () => {
    const parsed = parseEmailTranslateOutput(
      JSON.stringify({
        sourceLanguage: "en",
        translatedText: "مرحبا، أود معرفة المزيد",
      }),
    );
    assert.equal(parsed.sourceLanguage, "en");
    assert.match(parsed.translatedText, /مرحبا/);
  });

  it("accepts fenced JSON", () => {
    const parsed = parseEmailTranslateOutput(
      "```json\n" +
        JSON.stringify({ sourceLanguage: "ar", translatedText: "Hello there" }) +
        "\n```",
    );
    assert.equal(parsed.sourceLanguage, "ar");
    assert.equal(parsed.translatedText, "Hello there");
  });

  it("rejects empty / malformed output", () => {
    assert.throws(() => parseEmailTranslateOutput(""), /empty|malformed/i);
    assert.throws(() => parseEmailTranslateOutput("not json"), /malformed/i);
    assert.throws(
      () => parseEmailTranslateOutput(JSON.stringify({ sourceLanguage: "en", translatedText: "  " })),
      /empty/i,
    );
  });
});

describe("email-message-translate safety contract", () => {
  it("reuses ai_assistant + ai.conversations.reply gates", () => {
    assert.equal(EMAIL_MESSAGE_TRANSLATE_FEATURE_CODE, "ai_assistant");
    assert.equal(EMAIL_MESSAGE_TRANSLATE_PERMISSION, "ai.conversations.reply");
  });

  it("system prompt forbids send / draft / outbound", () => {
    const prompt = buildEmailTranslateSystemPrompt();
    assert.match(prompt, /NEVER send emails/i);
    assert.match(prompt, /NEVER create drafts/i);
    assert.match(prompt, /Do NOT translate URLs/i);
  });

  it("service never imports outbound send / SMTP / draft persistence", () => {
    const code = serviceSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /dispatchOutboundMessage/);
    assert.doesNotMatch(code, /EmailCloudAdapter/);
    assert.doesNotMatch(code, /generateEmailAiDraftServer/);
    assert.doesNotMatch(code, /from\s+["'][^"']*smtp/i);
    assert.doesNotMatch(code, /\.insert\(/);
    assert.doesNotMatch(code, /\.update\(/);
  });

  it("languageDisplayName maps known codes", () => {
    assert.equal(languageDisplayName("ar"), "Arabic");
    assert.equal(languageDisplayName("en"), "English");
    assert.equal(languageDisplayName("fr"), "French");
    assert.equal(languageDisplayName("de"), "German");
    assert.equal(languageDisplayName("es"), "Spanish");
    assert.equal(languageDisplayName("unknown"), "Unknown");
  });

  it("detects French, German, and Spanish source text", () => {
    assert.equal(
      detectEmailSourceLanguage(
        "Bonjour, merci beaucoup pour votre message. Pouvez-vous confirmer la commande demain s'il vous plait?",
      ).code,
      "fr",
    );
    assert.equal(
      detectEmailSourceLanguage(
        "Guten Tag, vielen Dank für Ihre Nachricht. Bitte senden Sie uns die Rechnung so schnell wie möglich.",
      ).code,
      "de",
    );
    assert.equal(
      detectEmailSourceLanguage(
        "Hola, gracias por su mensaje. Por favor envienos la factura para el pedido lo antes posible.",
      ).code,
      "es",
    );
  });

  it("marks metadata as neverSend / readOnly in gateway call", () => {
    assert.match(serviceSrc, /neverSend:\s*true/);
    assert.match(serviceSrc, /readOnly:\s*true/);
    assert.match(serviceSrc, /feature:\s*["']email_message_translate["']/);
  });

  it("rejects non-incoming messages", () => {
    assert.match(serviceSrc, /Only incoming messages can be translated/);
    assert.match(serviceSrc, /messageType !== ["']incoming["']/);
  });
});
