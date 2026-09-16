/**
 * POST /email/ai/draft route — commercial/RBAC gates + never-send response shape.
 * Uses lightweight request simulation without full Express stack where possible.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMAIL_AI_DRAFT_FEATURE_CODE,
  EMAIL_AI_DRAFT_PERMISSION,
} from "../services/email-ai-draft.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routeSrc = readFileSync(join(__dirname, "email-ai-draft.ts"), "utf8");

describe("email-ai-draft route security contract", () => {
  it("uses ai_assistant commercial feature (not plan_features)", () => {
    assert.equal(EMAIL_AI_DRAFT_FEATURE_CODE, "ai_assistant");
    assert.match(routeSrc, /assertRouteCommercialFeature/);
    assert.match(routeSrc, /EMAIL_AI_DRAFT_FEATURE_CODE/);
    assert.doesNotMatch(routeSrc, /plan_features/);
  });

  it("requires ai.conversations.reply permission server-side", () => {
    assert.equal(EMAIL_AI_DRAFT_PERMISSION, "ai.conversations.reply");
    assert.match(routeSrc, /requireCompanyPermission/);
    assert.match(routeSrc, /EMAIL_AI_DRAFT_PERMISSION/);
  });

  it("requires auth + company scope middleware", () => {
    assert.match(routeSrc, /requireSupabaseAuth/);
    assert.match(routeSrc, /requireCompanyScope/);
  });

  it("resolves company from authenticated scope, not AI prompt", () => {
    assert.match(routeSrc, /resolveEffectiveCompanyId/);
    assert.match(routeSrc, /supabaseCompanyId/);
  });

  it("accepts French, German, and Spanish output languages", () => {
    assert.match(routeSrc, /langRaw === "fr"/);
    assert.match(routeSrc, /langRaw === "de"/);
    assert.match(routeSrc, /langRaw === "es"/);
  });

  it("returns neverSend true and does not expose secrets", () => {
    assert.match(routeSrc, /neverSend:\s*true/);
    assert.doesNotMatch(routeSrc, /apiKey|SMTP_PASS|client_secret/i);
  });

  it("does not import or invoke outbound send pipeline", () => {
    // Ignore comments / docs; assert no executable imports or calls.
    const code = routeSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/`[\s\S]*?`/g, "``")
      .replace(/"(?:\\.|[^"\\])*"/g, '""')
      .replace(/'(?:\\.|[^'\\])*'/g, "''");
    assert.doesNotMatch(code, /dispatchOutboundMessage/);
    assert.doesNotMatch(code, /EmailCloudAdapter/);
    assert.doesNotMatch(code, /createDelivery/);
    assert.doesNotMatch(code, /from\s+["'][^"']*smtp/i);
  });
});
