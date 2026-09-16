/**
 * Client-side AI Write helpers — stale response guard + locale presence.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldApplyEmailAiDraft } from "./email-ai-write-guards.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("shouldApplyEmailAiDraft", () => {
  it("applies when token and body unchanged", () => {
    assert.equal(
      shouldApplyEmailAiDraft({
        requestToken: 3,
        currentToken: 3,
        composerBodyAtRequest: "<p>a</p>",
        currentComposerBody: "<p>a</p>",
      }),
      true,
    );
  });

  it("rejects stale token so older AI response cannot overwrite newer edits", () => {
    assert.equal(
      shouldApplyEmailAiDraft({
        requestToken: 2,
        currentToken: 3,
        composerBodyAtRequest: "<p>a</p>",
        currentComposerBody: "<p>a</p>",
      }),
      false,
    );
  });

  it("rejects when user edited composer while AI ran", () => {
    assert.equal(
      shouldApplyEmailAiDraft({
        requestToken: 1,
        currentToken: 1,
        composerBodyAtRequest: "<p>old</p>",
        currentComposerBody: "<p>user typed more</p>",
      }),
      false,
    );
  });
});

describe("email AI Write UI localization", () => {
  it("English and Arabic aiWrite keys are present without Translation placeholders", () => {
    const localesRoot = join(__dirname, "../../locales");
    const en = JSON.parse(readFileSync(join(localesRoot, "en/common.json"), "utf8")) as {
      emailModule: { workspace: { aiWrite: Record<string, string>; ai: { writeWithAi: string } } };
    };
    const ar = JSON.parse(readFileSync(join(localesRoot, "ar/common.json"), "utf8")) as {
      emailModule: { workspace: { aiWrite: Record<string, string>; ai: { writeWithAi: string } } };
    };

    const required = [
      "title",
      "promptLabel",
      "generate",
      "insert",
      "replace",
      "insertBelow",
      "regenerate",
      "cancel",
      "working",
      "error",
      "neverSendHint",
      "sessionExpired",
      "languageFr",
      "languageDe",
      "languageEs",
    ] as const;

    for (const key of required) {
      assert.ok(en.emailModule.workspace.aiWrite[key], `en missing ${key}`);
      assert.ok(ar.emailModule.workspace.aiWrite[key], `ar missing ${key}`);
      assert.doesNotMatch(en.emailModule.workspace.aiWrite[key], /\[Translation\]/i);
      assert.doesNotMatch(ar.emailModule.workspace.aiWrite[key], /\[Translation\]/i);
    }

    assert.equal(en.emailModule.workspace.ai.writeWithAi, "Write with AI");
    assert.equal(ar.emailModule.workspace.ai.writeWithAi, "اكتب بالذكاء الاصطناعي");
    assert.match(ar.emailModule.workspace.aiWrite.working, /الذكاء الاصطناعي/);
    assert.match(en.emailModule.workspace.aiWrite.working, /AI is writing/i);
    assert.equal(en.emailModule.workspace.aiWrite.languageFr, "French");
    assert.equal(en.emailModule.workspace.aiWrite.languageDe, "German");
    assert.equal(en.emailModule.workspace.aiWrite.languageEs, "Spanish");
    assert.equal(ar.emailModule.workspace.aiWrite.languageFr, "الفرنسية");
    assert.equal(ar.emailModule.workspace.aiWrite.languageDe, "الألمانية");
    assert.equal(ar.emailModule.workspace.aiWrite.languageEs, "الإسبانية");
  });

  it("AI Write panel exposes French, German, and Spanish", () => {
    const src = readFileSync(
      join(__dirname, "../../components/email/email-ai-write-panel.tsx"),
      "utf8",
    );
    assert.match(src, /value="fr"/);
    assert.match(src, /value="de"/);
    assert.match(src, /value="es"/);
    assert.match(src, /languageFr/);
    assert.match(src, /languageDe/);
    assert.match(src, /languageEs/);
  });
});

describe("email-ai-write client never-send contract", () => {
  it("client helper only targets /email/ai/draft", () => {
    const src = readFileSync(join(__dirname, "email-ai-write.ts"), "utf8");
    assert.match(src, /\/email\/ai\/draft/);
    assert.doesNotMatch(src, /dispatchOutboundMessage|\/email\/send|smtp/i);
    assert.match(src, /neverSend:\s*true/);
    assert.match(src, /json\.language === "fr"/);
    assert.match(src, /json\.language === "de"/);
    assert.match(src, /json\.language === "es"/);
    assert.match(src, /hasExistingSignature:\s*input\.hasExistingSignature === true/);
  });

  it("refreshes stale access tokens before calling the AI draft API", () => {
    const src = readFileSync(join(__dirname, "email-ai-write.ts"), "utf8");
    assert.match(src, /getFreshAccessToken/);
    assert.match(src, /EmailAiWriteAuthError/);
    assert.match(src, /response\.status === 401/);
  });
});

describe("managed company signature flag for AI Write", () => {
  it("detects Brand Center signature presence without sending HTML to the LLM", async () => {
    const { hasManagedCompanyEmailSignature, buildComposerOutboundHtml } = await import(
      "./email-signature-text.ts"
    );
    assert.equal(hasManagedCompanyEmailSignature(""), false);
    assert.equal(hasManagedCompanyEmailSignature("   "), false);
    assert.equal(hasManagedCompanyEmailSignature("<p><br/></p>"), false);
    assert.equal(hasManagedCompanyEmailSignature("<p>Best regards,<br/>Omar</p>"), true);

    const body = "Dear Customer,\n\nWe apologize for the delay.";
    const signatureHtml = "<p>Best regards,<br/>Omar<br/>ValueOR</p>";
    const once = buildComposerOutboundHtml({ bodyHtml: `<p>${body}</p>`, signatureHtml });
    const twice = buildComposerOutboundHtml({ bodyHtml: once, signatureHtml });
    assert.equal(once, twice);
    assert.equal((once.match(/Best regards/gi) ?? []).length, 1);
  });

  it("EmailWorkspacePanel passes effective signature flag into AI Write without HTML", () => {
    const panel = readFileSync(
      join(__dirname, "../../components/email/email-workspace-panel.tsx"),
      "utf8",
    );
    assert.match(panel, /resolveEffectiveEmailSignature/);
    assert.match(panel, /effectiveSignature/);
    assert.match(panel, /requestEmailAiDraft\(/);
    assert.doesNotMatch(panel, /hasExistingSignature:\s*true/);
    const aiWriteSlice = panel.slice(
      panel.indexOf("requestEmailAiDraft("),
      panel.indexOf("requestEmailAiDraft(") + 900,
    );
    assert.match(aiWriteSlice, /hasExistingSignature:\s*effectiveSignature\.source !== "none"/);
    assert.doesNotMatch(aiWriteSlice, /signatureHtml|companySignatureHtml|email\.signature/);
  });
});
