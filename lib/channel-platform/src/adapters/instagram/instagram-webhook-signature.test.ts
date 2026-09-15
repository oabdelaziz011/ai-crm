import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { collectInstagramWebhookSignatureSecrets } from "./instagram-webhook-signature-secrets.js";
import { verifyInstagramWebhookSignature } from "./instagram-api-client.js";
import { verifyWhatsAppWebhookSignature } from "../whatsapp/whatsapp-api-client.js";
import {
  verifyMetaWebhookSignature,
  verifyMetaWebhookSignatureWithSecrets,
} from "../meta/meta-graph-webhook.js";

/** Fixture only — never a production Meta secret. */
const FIXTURE_SECRET = "test-meta-app-secret";
const FIXTURE_BODY =
  '{"object":"instagram","entry":[{"id":"17841400000000000","messaging":[{"message":{"text":"hi"}}]}]}';

function nodeHmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

describe("Instagram Meta webhook HMAC (Buffer + sha256= fixture)", () => {
  it("accepts sha256=hex over a single UTF-8 conversion from an Express-like Buffer", async () => {
    const buffer = Buffer.from(FIXTURE_BODY, "utf8");
    const rawBody = buffer.toString("utf8");
    assert.equal(rawBody, FIXTURE_BODY);
    assert.equal(Buffer.byteLength(rawBody, "utf8"), buffer.length);

    const digestFromBuffer = nodeHmacSha256Hex(FIXTURE_SECRET, buffer);
    const digestFromString = nodeHmacSha256Hex(FIXTURE_SECRET, rawBody);
    assert.equal(digestFromBuffer, digestFromString);
    assert.match(digestFromBuffer, /^[0-9a-f]{64}$/);

    const signatureHeader = `sha256=${digestFromBuffer}`;
    const input = {
      signatureHeader,
      rawBody,
      appSecret: FIXTURE_SECRET,
      requireSecret: true,
    };

    assert.equal(await verifyMetaWebhookSignature(input), true);
    assert.equal(await verifyInstagramWebhookSignature(input), true);
    assert.equal(await verifyWhatsAppWebhookSignature(input), true);
  });

  it("rejects JSON reserialization when it would change the signed bytes", async () => {
    const original = '{"object":"instagram","entry":[]}';
    const buffer = Buffer.from(original, "utf8");
    const digest = nodeHmacSha256Hex(FIXTURE_SECRET, buffer);
    const reserialized = JSON.stringify(JSON.parse(buffer.toString("utf8")));
    const header = `sha256=${digest}`;

    assert.equal(
      await verifyInstagramWebhookSignature({
        signatureHeader: header,
        rawBody: buffer.toString("utf8"),
        appSecret: FIXTURE_SECRET,
        requireSecret: true,
      }),
      true,
    );

    if (reserialized !== original) {
      assert.equal(
        await verifyInstagramWebhookSignature({
          signatureHeader: header,
          rawBody: reserialized,
          appSecret: FIXTURE_SECRET,
          requireSecret: true,
        }),
        false,
      );
    }
  });

  it("rejects a present header that does not use the sha256= prefix", async () => {
    const buffer = Buffer.from(FIXTURE_BODY, "utf8");
    const digest = nodeHmacSha256Hex(FIXTURE_SECRET, buffer.toString("utf8"));

    assert.equal(
      await verifyInstagramWebhookSignature({
        signatureHeader: `sha1=${digest}`,
        rawBody: buffer.toString("utf8"),
        appSecret: FIXTURE_SECRET,
        requireSecret: true,
      }),
      false,
    );
  });

  it("rejects an invalid Instagram sha256 signature", async () => {
    const buffer = Buffer.from(FIXTURE_BODY, "utf8");
    assert.equal(
      await verifyInstagramWebhookSignature({
        signatureHeader: `sha256=${"ab".repeat(32)}`,
        rawBody: buffer.toString("utf8"),
        appSecret: FIXTURE_SECRET,
        requireSecret: true,
      }),
      false,
    );
  });

  it("rejects a missing Instagram signature when a secret is required", async () => {
    const buffer = Buffer.from(FIXTURE_BODY, "utf8");
    assert.equal(
      await verifyInstagramWebhookSignature({
        signatureHeader: null,
        rawBody: buffer.toString("utf8"),
        appSecret: FIXTURE_SECRET,
        requireSecret: true,
      }),
      false,
    );
  });

  it("selects the webhook-owning app secret from mixed Instagram credential sources", async () => {
    const buffer = Buffer.from(FIXTURE_BODY, "utf8");
    const rawBody = buffer.toString("utf8");
    const owningSecret = "owning-meta-app-secret";
    const staleSecret = "stale-other-app-secret";
    const header = `sha256=${nodeHmacSha256Hex(owningSecret, rawBody)}`;
    const secretSet = collectInstagramWebhookSignatureSecrets({
      companyAppSecret: staleSecret,
      env: {
        INSTAGRAM_WEBHOOK_APP_SECRET: owningSecret,
        INSTAGRAM_WEBHOOK_APP_ID: "1093065463072724",
      },
    });

    const result = await verifyMetaWebhookSignatureWithSecrets({
      signatureHeader: header,
      rawBody,
      secrets: secretSet.candidates,
      requireSecret: true,
    });

    assert.equal(secretSet.expectedMetaAppId, "1093065463072724");
    assert.equal(result.ok, true);
    assert.equal(result.matchedSource, "env_instagram_webhook_app");
    assert.equal(
      await verifyWhatsAppWebhookSignature({
        signatureHeader: header,
        rawBody,
        appSecret: staleSecret,
        requireSecret: true,
      }),
      false,
    );
    assert.equal(
      await verifyWhatsAppWebhookSignature({
        signatureHeader: header,
        rawBody,
        appSecret: owningSecret,
        requireSecret: true,
      }),
      true,
    );
  });
});
