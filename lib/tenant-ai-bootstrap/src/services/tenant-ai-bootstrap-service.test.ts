import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTenantAiBootstrapResult } from "../parse-tenant-ai-bootstrap-result.js";
import {
  DEFAULT_COLLECTION_NAME,
  TENANT_PROMPT_TEMPLATE_KEYS,
} from "../constants.js";

describe("parseTenantAiBootstrapResult", () => {
  it("parses RPC payload with steps", () => {
    const result = parseTenantAiBootstrapResult(
      {
        company_id: "11111111-1111-4111-8111-111111111111",
        skipped: false,
        steps: [{ step: "assistant_settings", created: true, skipped: false }],
      },
      "fallback-id",
    );

    assert.equal(result.companyId, "11111111-1111-4111-8111-111111111111");
    assert.equal(result.skipped, false);
    assert.equal(result.steps.length, 1);
    assert.equal(result.steps[0]?.step, "assistant_settings");
  });

  it("falls back to provided company id when payload is empty", () => {
    const result = parseTenantAiBootstrapResult(null, "22222222-2222-4222-8222-222222222222");
    assert.equal(result.companyId, "22222222-2222-4222-8222-222222222222");
    assert.equal(result.steps.length, 0);
  });
});

describe("tenant bootstrap constants", () => {
  it("uses stable default collection and prompt keys", () => {
    assert.equal(DEFAULT_COLLECTION_NAME, "knowledge_default");
    assert.equal(TENANT_PROMPT_TEMPLATE_KEYS.conversationEn, "tenant_conversation_en");
    assert.equal(TENANT_PROMPT_TEMPLATE_KEYS.conversationAr, "tenant_conversation_ar");
  });
});
