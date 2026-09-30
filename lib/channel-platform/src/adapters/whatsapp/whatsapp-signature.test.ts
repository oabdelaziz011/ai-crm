import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hmacSha256Hex } from "@workspace/platform-crypto";
import { verifyWhatsAppWebhookSignature } from "./whatsapp-api-client.js";

describe("verifyWhatsAppWebhookSignature", () => {
  it("accepts valid Meta sha256 signatures", async () => {
    const secret = "meta-app-secret";
    const body = '{"object":"whatsapp_business_account"}';
    const digest = await hmacSha256Hex(secret, body);

    assert.equal(
      await verifyWhatsAppWebhookSignature({
        signatureHeader: `sha256=${digest}`,
        rawBody: body,
        appSecret: secret,
        requireSecret: true,
      }),
      true,
    );
  });

  it("rejects invalid signatures when secret is required", async () => {
    assert.equal(
      await verifyWhatsAppWebhookSignature({
        signatureHeader: "sha256=deadbeef",
        rawBody: "{}",
        appSecret: "secret",
        requireSecret: true,
      }),
      false,
    );
  });

  it("rejects missing signature when secret is required", async () => {
    assert.equal(
      await verifyWhatsAppWebhookSignature({
        signatureHeader: null,
        rawBody: "{}",
        appSecret: "secret",
        requireSecret: true,
      }),
      false,
    );
  });

  it("allows missing signature in non-production when secret is not required", async () => {
    assert.equal(
      await verifyWhatsAppWebhookSignature({
        signatureHeader: null,
        rawBody: "{}",
        appSecret: null,
        requireSecret: false,
      }),
      true,
    );
  });

  it("allows missing signature in development even when a local appSecret is configured", async () => {
    assert.equal(
      await verifyWhatsAppWebhookSignature({
        signatureHeader: null,
        rawBody: "{}",
        appSecret: "local-configured-secret",
        requireSecret: false,
      }),
      true,
    );
  });

  it("allows HMAC mismatch in development when requireSecret=false (stale local App Secret)", async () => {
    const body = '{"object":"whatsapp_business_account"}';
    const digest = await hmacSha256Hex("meta-cloud-app-secret", body);
    assert.equal(
      await verifyWhatsAppWebhookSignature({
        signatureHeader: `sha256=${digest}`,
        rawBody: body,
        appSecret: "wrong-local-app-secret",
        requireSecret: false,
      }),
      true,
    );
  });
});
