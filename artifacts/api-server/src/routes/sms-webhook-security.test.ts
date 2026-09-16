/**
 * SMS webhook security — signature rejection before conversation/message create.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeTwilioRequestSignature,
  resolveTwilioWebhookValidationUrl,
  verifyTwilioRequestSignature,
} from "@workspace/channel-platform";

describe("SMS webhook signature security", () => {
  const authToken = "sms_auth_token_secret";
  const publicBase = "https://webhook.valueor.org";
  const companyChannelId = "cc-sms-secure-1";
  const params = {
    MessageSid: "SMsec1",
    From: "+15551234567",
    To: "+15557654321",
    Body: "hello",
  };

  it("rejects unsigned / invalid signatures", () => {
    const url = `${publicBase}/api/webhooks/sms/${companyChannelId}`;
    assert.equal(
      verifyTwilioRequestSignature({
        authToken,
        signatureHeader: null,
        url,
        params,
      }),
      false,
    );
    assert.equal(
      verifyTwilioRequestSignature({
        authToken,
        signatureHeader: "invalid",
        url,
        params,
      }),
      false,
    );
  });

  it("accepts only the canonical public webhook URL signature", () => {
    const url = resolveTwilioWebhookValidationUrl({
      publicBaseUrl: publicBase,
      requestProtocol: "https",
      requestHost: "webhook.valueor.org",
      originalUrl: `/api/webhooks/sms/${companyChannelId}`,
    });
    assert.match(url, /^https:\/\/webhook\.valueor\.org\/api\/webhooks\/sms\//);
    assert.doesNotMatch(url, /localhost/i);

    const signature = computeTwilioRequestSignature(authToken, url, params);
    assert.equal(
      verifyTwilioRequestSignature({
        authToken,
        signatureHeader: signature,
        url,
        params,
      }),
      true,
    );

    // Wrong host must not validate.
    const wrongUrl = url.replace("webhook.valueor.org", "localhost:8787");
    assert.equal(
      verifyTwilioRequestSignature({
        authToken,
        signatureHeader: signature,
        url: wrongUrl,
        params,
      }),
      false,
    );
  });
});
