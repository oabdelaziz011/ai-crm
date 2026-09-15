import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  verifyMetaWebhookSignature,
  verifyMetaWebhookSignatureWithSecrets,
} from "./meta-graph-webhook.js";

const FIXTURE_SECRET = "test-meta-app-secret";
const OTHER_SECRET = "other-meta-app-secret";
const FIXTURE_BODY = '{"object":"instagram","entry":[]}';

function nodeHmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

describe("verifyMetaWebhookSignatureWithSecrets", () => {
  it("accepts the first matching candidate without rewriting HMAC", async () => {
    const rawBody = FIXTURE_BODY;
    const header = `sha256=${nodeHmacSha256Hex(OTHER_SECRET, rawBody)}`;

    const result = await verifyMetaWebhookSignatureWithSecrets({
      signatureHeader: header,
      rawBody,
      requireSecret: true,
      secrets: [
        { source: "env_instagram_webhook_app", secret: FIXTURE_SECRET },
        { source: "company_instagram_settings", secret: OTHER_SECRET },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.matchedSource, "company_instagram_settings");
    assert.deepEqual(result.sourcesTried, [
      "env_instagram_webhook_app",
      "company_instagram_settings",
    ]);
    assert.equal(
      await verifyMetaWebhookSignature({
        signatureHeader: header,
        rawBody,
        appSecret: OTHER_SECRET,
        requireSecret: true,
      }),
      true,
    );
  });

  it("rejects when no candidate matches", async () => {
    const result = await verifyMetaWebhookSignatureWithSecrets({
      signatureHeader: `sha256=${nodeHmacSha256Hex(FIXTURE_SECRET, FIXTURE_BODY)}`,
      rawBody: FIXTURE_BODY,
      requireSecret: true,
      secrets: [{ source: "company_instagram_settings", secret: OTHER_SECRET }],
    });

    assert.equal(result.ok, false);
    assert.equal(result.matchedSource, null);
  });

  it("rejects a missing signature when a secret is present", async () => {
    const result = await verifyMetaWebhookSignatureWithSecrets({
      signatureHeader: undefined,
      rawBody: FIXTURE_BODY,
      requireSecret: true,
      secrets: [{ source: "company_instagram_settings", secret: FIXTURE_SECRET }],
    });

    assert.equal(result.ok, false);
    assert.equal(result.headerPresent, false);
    assert.equal(result.headerStartsWithSha256, false);
  });

  it("does not skip verification when candidates exist even if requireSecret is false", async () => {
    const result = await verifyMetaWebhookSignatureWithSecrets({
      signatureHeader: "sha256=deadbeef",
      rawBody: FIXTURE_BODY,
      requireSecret: false,
      secrets: [{ source: "company_instagram_settings", secret: FIXTURE_SECRET }],
    });

    assert.equal(result.ok, false);
  });
});
