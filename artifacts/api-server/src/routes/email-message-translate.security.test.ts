/**
 * POST /email/messages/:messageId/translate — security / isolation contract.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMAIL_MESSAGE_TRANSLATE_FEATURE_CODE,
  EMAIL_MESSAGE_TRANSLATE_PERMISSION,
} from "../services/email-message-translate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routeSrc = readFileSync(join(__dirname, "email-message-translate.ts"), "utf8");
const draftRouteSrc = readFileSync(join(__dirname, "email-ai-draft.ts"), "utf8");
const indexSrc = readFileSync(join(__dirname, "index.ts"), "utf8");

describe("email-message-translate route security", () => {
  it("uses ai_assistant commercial feature", () => {
    assert.equal(EMAIL_MESSAGE_TRANSLATE_FEATURE_CODE, "ai_assistant");
    assert.match(routeSrc, /assertRouteCommercialFeature/);
    assert.match(routeSrc, /EMAIL_MESSAGE_TRANSLATE_FEATURE_CODE/);
  });

  it("requires ai.conversations.reply permission", () => {
    assert.equal(EMAIL_MESSAGE_TRANSLATE_PERMISSION, "ai.conversations.reply");
    assert.match(routeSrc, /requireCompanyPermission/);
    assert.match(routeSrc, /EMAIL_MESSAGE_TRANSLATE_PERMISSION/);
  });

  it("requires auth + company scope", () => {
    assert.match(routeSrc, /requireSupabaseAuth/);
    assert.match(routeSrc, /requireCompanyScope/);
  });

  it("exposes dedicated translate endpoint (not draft)", () => {
    assert.match(routeSrc, /\/email\/messages\/:messageId\/translate/);
    assert.doesNotMatch(routeSrc, /\/email\/ai\/draft/);
    assert.match(indexSrc, /emailMessageTranslateRouter/);
  });

  it("returns neverSend and does not expose secrets", () => {
    assert.match(routeSrc, /neverSend:\s*true/);
    assert.doesNotMatch(routeSrc, /apiKey|SMTP_PASS|client_secret/i);
  });

  it("does not import outbound send pipeline", () => {
    const code = routeSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /dispatchOutboundMessage/);
    assert.doesNotMatch(code, /EmailCloudAdapter/);
    assert.doesNotMatch(code, /createDelivery/);
    assert.doesNotMatch(code, /from\s+["'][^"']*smtp/i);
  });

  it("logs translation_request_failed diagnostics without secrets", () => {
    assert.match(routeSrc, /translation_request_failed/);
    assert.match(routeSrc, /logger\.warn/);
    assert.doesNotMatch(routeSrc, /apiKey|SMTP_PASS|client_secret/i);
  });
});
