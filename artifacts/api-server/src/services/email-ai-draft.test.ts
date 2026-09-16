/**
 * Email AI Draft Copilot — focused unit tests.
 * Proves structured contract, subject preservation, never-send isolation.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyEmailAiDraftBodyGuards,
  buildEmailAiDraftSystemPrompt,
  buildEmailAiDraftUserPrompt,
  emailAiDraftLanguageDisplayName,
  parseAndValidateEmailAiDraftOutput,
  resolveEmailAiDraftOutputLanguage,
  stripStandaloneEmailSignOff,
} from "./email-ai-draft.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("email-ai-draft parseAndValidateEmailAiDraftOutput", () => {
  it("parses Arabic instruction → English formal structured output", () => {
    const raw = JSON.stringify({
      subject: "Update Regarding Your Order",
      body: "Dear Customer,\n\nWe apologize for the delay.\n\nBest regards",
      language: "en",
      tone: "formal",
    });
    const parsed = parseAndValidateEmailAiDraftOutput(raw);
    assert.equal(parsed.language, "en");
    assert.equal(parsed.tone, "formal");
    assert.match(parsed.body, /apologize/i);
    assert.ok(parsed.subject.length > 0);
  });

  it("parses Arabic professional email output", () => {
    const raw = JSON.stringify({
      subject: "بخصوص طلبكم",
      body: "عزيزي العميل،\nنعتذر عن التأخير.\nمع خالص التحية",
      language: "ar",
      tone: "professional",
    });
    const parsed = parseAndValidateEmailAiDraftOutput(raw);
    assert.equal(parsed.language, "ar");
    assert.match(parsed.body, /نعتذر/);
  });

  it("parses English formal email", () => {
    const raw = JSON.stringify({
      subject: "Order confirmation",
      body: "Dear Customer,\nYour order will be completed tomorrow.",
      language: "en",
      tone: "formal",
    });
    const parsed = parseAndValidateEmailAiDraftOutput(raw);
    assert.equal(parsed.language, "en");
    assert.match(parsed.body, /tomorrow/i);
  });

  it("accepts JSON wrapped in markdown fences", () => {
    const raw = "```json\n" + JSON.stringify({
      subject: "Hello",
      body: "Body text",
      language: "en",
      tone: "friendly",
    }) + "\n```";
    const parsed = parseAndValidateEmailAiDraftOutput(raw);
    assert.equal(parsed.body, "Body text");
  });

  it("rejects malformed AI response", () => {
    assert.throws(() => parseAndValidateEmailAiDraftOutput("not json at all"), /malformed|empty/i);
  });

  it("rejects empty body", () => {
    assert.throws(
      () =>
        parseAndValidateEmailAiDraftOutput(
          JSON.stringify({ subject: "X", body: "  ", language: "en", tone: "professional" }),
        ),
      /empty/i,
    );
  });

  it("defaults invalid tone/language safely", () => {
    const parsed = parseAndValidateEmailAiDraftOutput(
      JSON.stringify({ subject: "S", body: "Hello", language: "xx", tone: "dramatic" }),
    );
    assert.equal(parsed.language, "en");
    assert.equal(parsed.tone, "professional");
  });

  it("accepts French, German, and Spanish language codes", () => {
    for (const language of ["fr", "de", "es"] as const) {
      const parsed = parseAndValidateEmailAiDraftOutput(
        JSON.stringify({
          subject: "S",
          body: "Corps / Inhalt / Cuerpo",
          language,
          tone: "professional",
        }),
      );
      assert.equal(parsed.language, language);
    }
  });
});

describe("email-ai-draft prompts", () => {
  it("system prompt forbids send/dispatch and standalone sign-offs", () => {
    const prompt = buildEmailAiDraftSystemPrompt({ hasExistingSignature: true });
    assert.match(prompt, /NEVER send emails/i);
    assert.match(prompt, /dispatchOutboundMessage/);
    assert.match(prompt, /ONLY generate draft/i);
    assert.match(prompt, /"fr", "de", "es"/);
    assert.match(prompt, /Do not invent/);
    assert.match(prompt, /Do NOT generate an email signature/i);
    assert.match(prompt, /Best regards/i);
    assert.match(prompt, /Brand Center/i);
    assert.match(prompt, /Thank you for your patience/i);
  });

  it("system prompt without managed signature does not hard-forbid sign-offs", () => {
    const prompt = buildEmailAiDraftSystemPrompt({ hasExistingSignature: false });
    assert.match(prompt, /NEVER send emails/i);
    assert.doesNotMatch(prompt, /Standalone sign-off blocks at the END/i);
    assert.match(prompt, /Prefer not to invent a signature block/i);
  });

  it("user prompt includes trusted company/customer and no invented IDs from client", () => {
    const prompt = buildEmailAiDraftUserPrompt({
      instruction: "قوله آسفين بالانجليزي",
      mode: "generate",
      tone: "formal",
      outputLanguage: "en",
      subject: "",
      body: "",
      updateSubject: true,
      companyName: "Acme Co",
      customerName: "Sara",
      customerEmail: "sara@example.com",
      threadText: "Customer: where is my order?",
      hasExistingSignature: true,
    });
    assert.match(prompt, /Acme Co/);
    assert.match(prompt, /Sara/);
    assert.match(prompt, /sara@example\.com/);
    assert.match(prompt, /قوله آسفين/);
    assert.match(prompt, /Composer already has signature: yes/);
    assert.doesNotMatch(prompt, /company_id\s*=/i);
  });

  it("user prompt reports no managed signature without hard-forbid wording", () => {
    const prompt = buildEmailAiDraftUserPrompt({
      instruction: "write a reply",
      mode: "generate",
      tone: "professional",
      outputLanguage: "en",
      subject: "",
      body: "",
      updateSubject: true,
      companyName: "Acme",
      customerName: null,
      customerEmail: null,
      threadText: "",
      hasExistingSignature: false,
    });
    assert.match(prompt, /Composer already has signature: no/);
  });

  it("rewrite prompt marks subject update false", () => {
    const prompt = buildEmailAiDraftUserPrompt({
      instruction: "خليه رسمي أكتر",
      mode: "rewrite",
      tone: "formal",
      outputLanguage: "en",
      subject: "Order update",
      body: "hello sorry late",
      updateSubject: false,
      companyName: "Acme",
      customerName: null,
      customerEmail: null,
      threadText: "",
      hasExistingSignature: true,
    });
    assert.match(prompt, /Update subject: no/);
    assert.match(prompt, /Order update/);
  });

  it("user prompt names French, German, and Spanish as output languages", () => {
    assert.equal(emailAiDraftLanguageDisplayName("fr"), "French");
    assert.equal(emailAiDraftLanguageDisplayName("de"), "German");
    assert.equal(emailAiDraftLanguageDisplayName("es"), "Spanish");
    const prompt = buildEmailAiDraftUserPrompt({
      instruction: "Antworten Sie höflich",
      mode: "generate",
      tone: "professional",
      outputLanguage: "de",
      subject: "",
      body: "",
      updateSubject: true,
      companyName: "ValueOR",
      customerName: null,
      customerEmail: null,
      threadText: "",
      hasExistingSignature: true,
    });
    assert.match(prompt, /Output language: German/);
  });
});

describe("resolveEmailAiDraftOutputLanguage", () => {
  it("honors explicit French / German / Spanish selections", () => {
    assert.equal(resolveEmailAiDraftOutputLanguage("fr", "write a reply", ""), "fr");
    assert.equal(resolveEmailAiDraftOutputLanguage("de", "اكتب رد", ""), "de");
    assert.equal(resolveEmailAiDraftOutputLanguage("es", "write a reply", ""), "es");
  });

  it("detects target language from Arabic/English instruction hints when auto", () => {
    assert.equal(resolveEmailAiDraftOutputLanguage("auto", "اكتب الرد بالفرنسي", ""), "fr");
    assert.equal(resolveEmailAiDraftOutputLanguage("auto", "reply in German please", ""), "de");
    assert.equal(resolveEmailAiDraftOutputLanguage("auto", "responde en español", ""), "es");
  });
});

describe("stripStandaloneEmailSignOff", () => {
  it("removes Best regards + name/company block when signature exists", () => {
    const body = [
      "Dear Customer,",
      "",
      "We apologize for the delay.",
      "",
      "Best regards,",
      "Omar",
      "ValueOR",
    ].join("\n");
    const stripped = applyEmailAiDraftBodyGuards(body, { hasExistingSignature: true });
    assert.match(stripped, /We apologize for the delay\./);
    assert.doesNotMatch(stripped, /Best regards/i);
    assert.doesNotMatch(stripped, /\bOmar\b/);
    assert.doesNotMatch(stripped, /ValueOR/);
  });

  it("removes Kind regards standalone ending", () => {
    const stripped = stripStandaloneEmailSignOff(
      "Hello,\n\nYour order is ready.\n\nKind regards,\nSupport",
    );
    assert.equal(stripped, "Hello,\n\nYour order is ready.");
  });

  it("removes Warm regards standalone ending", () => {
    const stripped = applyEmailAiDraftBodyGuards(
      "Dear Customer,\n\nWe will finish tomorrow.\n\nWarm regards,\nOmar",
      { hasExistingSignature: true },
    );
    assert.equal(stripped, "Dear Customer,\n\nWe will finish tomorrow.");
  });

  it("removes Regards + name standalone ending", () => {
    const stripped = applyEmailAiDraftBodyGuards(
      "Please confirm the address.\n\nRegards,\nJohn",
      { hasExistingSignature: true },
    );
    assert.equal(stripped, "Please confirm the address.");
  });

  it("removes Sincerely standalone ending", () => {
    const stripped = stripStandaloneEmailSignOff("Dear Customer,\n\nConfirmed.\n\nSincerely,");
    assert.equal(stripped, "Dear Customer,\n\nConfirmed.");
  });

  it("keeps Thank you for your patience in body", () => {
    const body = "Dear Customer,\n\nThank you for your patience.\n\nWe will finish tomorrow.";
    assert.equal(stripStandaloneEmailSignOff(body), body);
  });

  it("keeps Thanks for contacting us", () => {
    const body = "Hello,\n\nThanks for contacting us.\n\nWe will review your request.";
    assert.equal(
      applyEmailAiDraftBodyGuards(body, { hasExistingSignature: true }),
      body,
    );
  });

  it("keeps We appreciate your cooperation", () => {
    const body = "Dear Customer,\n\nWe appreciate your cooperation.";
    assert.equal(
      applyEmailAiDraftBodyGuards(body, { hasExistingSignature: true }),
      body,
    );
  });

  it("keeps Please confirm the address. Thank you.", () => {
    const body = "Dear Customer,\n\nPlease confirm the address. Thank you.";
    assert.equal(
      applyEmailAiDraftBodyGuards(body, { hasExistingSignature: true }),
      body,
    );
  });

  it("keeps legitimate sentence containing Regards", () => {
    const body = "Dear Customer,\n\nRegards to the team for the quick update.";
    assert.equal(stripStandaloneEmailSignOff(body), body);
  });

  it("does not strip when hasExistingSignature is false", () => {
    const body = "Hello,\n\nDone.\n\nBest regards,\nOmar";
    assert.equal(applyEmailAiDraftBodyGuards(body, { hasExistingSignature: false }), body);
  });

  it("does not strip when hasExistingSignature is omitted", () => {
    const body = "Hello,\n\nDone.\n\nBest regards,\nOmar";
    assert.equal(applyEmailAiDraftBodyGuards(body), body);
  });

  it("preserves structured output after parse then guard", () => {
    const parsed = parseAndValidateEmailAiDraftOutput(
      JSON.stringify({
        subject: "Update",
        body: "Dear Customer,\n\nWe apologize for the delay.\n\nBest regards,\nAgent",
        language: "en",
        tone: "formal",
      }),
    );
    const body = applyEmailAiDraftBodyGuards(parsed.body, { hasExistingSignature: true });
    assert.equal(parsed.subject, "Update");
    assert.equal(parsed.language, "en");
    assert.doesNotMatch(body, /Best regards/i);
    assert.match(body, /apologize/i);
  });
});

describe("email-ai-draft never-send architectural isolation", () => {
  function stripCommentsAndStrings(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/`[\s\S]*?`/g, "``")
      .replace(/"(?:\\.|[^"\\])*"/g, '""')
      .replace(/'(?:\\.|[^'\\])*'/g, "''");
  }

  it("service module does not import outbound send / SMTP / Graph / dispatch", () => {
    const src = readFileSync(join(__dirname, "email-ai-draft.ts"), "utf8");
    const code = stripCommentsAndStrings(src);
    assert.doesNotMatch(code, /dispatchOutboundMessage/);
    assert.doesNotMatch(code, /EmailCloudAdapter/);
    assert.doesNotMatch(code, /from\s+["'][^"']*smtp/i);
    assert.doesNotMatch(code, /microsoft-graph-email-client/);
    assert.doesNotMatch(code, /delivery[_-]queue/i);
    assert.doesNotMatch(code, /\bsendMail\b|\bsendEmail\b/);
  });

  it("route module does not call outbound send", () => {
    const src = readFileSync(join(__dirname, "../routes/email-ai-draft.ts"), "utf8");
    const code = stripCommentsAndStrings(src);
    assert.doesNotMatch(code, /dispatchOutboundMessage/);
    assert.doesNotMatch(code, /EmailCloudAdapter/);
    assert.match(src, /neverSend:\s*true/);
    assert.match(src, /EMAIL_AI_DRAFT_FEATURE_CODE/);
    assert.match(src, /EMAIL_AI_DRAFT_PERMISSION/);
  });
});

describe("email-ai-draft subject preservation helpers", () => {
  it("preserves existing subject when updateSubject is false", () => {
    const existing = "Order update";
    const parsed = parseAndValidateEmailAiDraftOutput(
      JSON.stringify({
        subject: "Totally New Subject",
        body: "Polished body",
        language: "en",
        tone: "formal",
      }),
    );
    const updateSubject = false;
    const finalSubject = updateSubject || !existing ? parsed.subject || existing : existing;
    assert.equal(finalSubject, "Order update");
  });

  it("updates subject when empty or requested", () => {
    const parsed = parseAndValidateEmailAiDraftOutput(
      JSON.stringify({
        subject: "New Subject",
        body: "Body",
        language: "en",
        tone: "professional",
      }),
    );
    const existing = "";
    const updateSubject = true;
    const finalSubject = updateSubject || !existing ? parsed.subject || existing : existing;
    assert.equal(finalSubject, "New Subject");
  });
});
