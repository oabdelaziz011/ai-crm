import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectInstagramWebhookSignatureSecrets } from "./instagram-webhook-signature-secrets.js";

describe("collectInstagramWebhookSignatureSecrets", () => {
  it("prefers env pin then previous then company, and drops duplicate values", () => {
    const collected = collectInstagramWebhookSignatureSecrets({
      companyAppSecret: "  company-secret  ",
      env: {
        INSTAGRAM_WEBHOOK_APP_SECRET: "env-current",
        INSTAGRAM_WEBHOOK_APP_SECRET_PREVIOUS: "env-previous",
        INSTAGRAM_WEBHOOK_APP_ID: "1093065463072724",
      },
    });

    assert.equal(collected.expectedMetaAppId, "1093065463072724");
    assert.deepEqual(
      collected.candidates.map((candidate) => ({
        source: candidate.source,
        length: candidate.length,
        secret: candidate.secret,
      })),
      [
        { source: "env_instagram_webhook_app", length: 11, secret: "env-current" },
        { source: "env_instagram_webhook_app_previous", length: 12, secret: "env-previous" },
        { source: "company_instagram_settings", length: 14, secret: "company-secret" },
      ],
    );
  });

  it("does not duplicate a company secret that already matches the env pin", () => {
    const collected = collectInstagramWebhookSignatureSecrets({
      companyAppSecret: "same-secret",
      env: {
        INSTAGRAM_WEBHOOK_APP_SECRET: "same-secret",
        INSTAGRAM_WEBHOOK_APP_ID: "  ",
      },
    });

    assert.equal(collected.expectedMetaAppId, null);
    assert.deepEqual(
      collected.candidates.map((candidate) => candidate.source),
      ["env_instagram_webhook_app"],
    );
  });

  it("falls back to company_instagram_settings when env pins are absent", () => {
    const collected = collectInstagramWebhookSignatureSecrets({
      companyAppSecret: "company-only",
      env: {},
    });

    assert.deepEqual(
      collected.candidates.map((candidate) => candidate.source),
      ["company_instagram_settings"],
    );
    assert.equal(collected.candidates[0]?.secret, "company-only");
  });

  it("returns no candidates when every source is empty", () => {
    const collected = collectInstagramWebhookSignatureSecrets({
      companyAppSecret: "   ",
      env: {
        INSTAGRAM_WEBHOOK_APP_SECRET: "",
        INSTAGRAM_WEBHOOK_APP_SECRET_PREVIOUS: undefined,
      },
    });

    assert.deepEqual(collected.candidates, []);
    assert.equal(collected.expectedMetaAppId, null);
  });
});
