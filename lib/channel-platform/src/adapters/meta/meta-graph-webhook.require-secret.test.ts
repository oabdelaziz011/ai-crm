import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hmacSha256Hex } from "@workspace/platform-crypto";
import { verifyMetaWebhookSignature } from "./meta-graph-webhook.js";

describe("verifyMetaWebhookSignature requireSecret semantics", () => {
  it("production: rejects missing signature when secret configured", async () => {
    assert.equal(
      await verifyMetaWebhookSignature({
        signatureHeader: null,
        rawBody: "{}",
        appSecret: "secret",
        requireSecret: true,
      }),
      false,
    );
  });

  it("development: accepts missing signature when requireSecret=false even if appSecret is set", async () => {
    assert.equal(
      await verifyMetaWebhookSignature({
        signatureHeader: null,
        rawBody: "{}",
        appSecret: "local-not-meta-app-secret",
        requireSecret: false,
      }),
      true,
    );
  });

  it("development: accepts Meta-style POST when HMAC mismatches local appSecret and requireSecret=false", async () => {
    const body = '{"object":"whatsapp_business_account"}';
    const digest = await hmacSha256Hex("meta-real-app-secret", body);
    assert.equal(
      await verifyMetaWebhookSignature({
        signatureHeader: `sha256=${digest}`,
        rawBody: body,
        appSecret: "wrong-local-secret",
        requireSecret: false,
      }),
      true,
    );
  });

  it("production: still rejects HMAC mismatch when requireSecret=true", async () => {
    const body = '{"object":"whatsapp_business_account"}';
    const digest = await hmacSha256Hex("meta-real-app-secret", body);
    assert.equal(
      await verifyMetaWebhookSignature({
        signatureHeader: `sha256=${digest}`,
        rawBody: body,
        appSecret: "wrong-local-secret",
        requireSecret: true,
      }),
      false,
    );
  });

  it("accepts matching HMAC regardless of requireSecret", async () => {
    const secret = "matching-secret";
    const body = '{"ok":true}';
    const digest = await hmacSha256Hex(secret, body);
    assert.equal(
      await verifyMetaWebhookSignature({
        signatureHeader: `sha256=${digest}`,
        rawBody: body,
        appSecret: secret,
        requireSecret: true,
      }),
      true,
    );
  });
});
