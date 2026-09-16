import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTwilioSignaturePayload,
  computeTwilioRequestSignature,
  flattenTwilioFormParams,
  verifyTwilioRequestSignature,
} from "./twilio-sms-signature.js";
import { mapTwilioMessageStatus } from "./twilio-sms-types.js";
import { TwilioSmsAdapter } from "./twilio-sms-adapter.js";
import type { ChannelAdapterContext } from "../../ports/channel-adapter-port.js";

describe("Twilio SMS signature", () => {
  it("accepts a valid signature and rejects invalid", () => {
    const authToken = "test_auth_token";
    const url = "https://webhook.valueor.org/api/webhooks/sms/cc-1";
    const params = {
      MessageSid: "SM123",
      From: "+15551234567",
      To: "+15557654321",
      Body: "Hello",
    };
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
    assert.equal(
      verifyTwilioRequestSignature({
        authToken,
        signatureHeader: "bogus",
        url,
        params,
      }),
      false,
    );
  });

  it("builds deterministic payload order", () => {
    const a = buildTwilioSignaturePayload("https://x/y", { B: "2", A: "1" });
    const b = buildTwilioSignaturePayload("https://x/y", { A: "1", B: "2" });
    assert.equal(a, b);
    assert.equal(a, "https://x/yA1B2");
  });

  it("flattens form params without leaking objects", () => {
    assert.deepEqual(flattenTwilioFormParams({ From: "+1", nested: { x: 1 } }), {
      From: "+1",
      nested: "[object Object]",
    });
  });
});

describe("Twilio status mapping", () => {
  it("maps provider statuses into delivery statuses", () => {
    assert.equal(mapTwilioMessageStatus("queued"), "pending");
    assert.equal(mapTwilioMessageStatus("sent"), "sent");
    assert.equal(mapTwilioMessageStatus("delivered"), "delivered");
    assert.equal(mapTwilioMessageStatus("failed"), "failed");
    assert.equal(mapTwilioMessageStatus("undelivered"), "failed");
    assert.equal(mapTwilioMessageStatus("unknown"), null);
  });
});

describe("TwilioSmsAdapter", () => {
  const ctx: ChannelAdapterContext = {
    companyChannel: {
      id: "cc-sms-1",
      companyId: "co-1",
      channelKey: "sms",
      displayName: "SMS",
      provider: "twilio",
      isEnabled: true,
      configuration: { fromNumber: "+15557654321", credentialsSource: "company_sms_settings" },
    },
  };

  it("parses inbound webhook into message.received with phone thread id", () => {
    const adapter = new TwilioSmsAdapter();
    const envelopes = adapter.parseWebhookEvents(ctx, {
      MessageSid: "SM1",
      From: "+15551234567",
      To: "+15557654321",
      Body: "Hi",
      SmsStatus: "received",
    });
    assert.equal(envelopes.length, 1);
    assert.equal(envelopes[0]?.eventType, "message.received");
    assert.equal(envelopes[0]?.externalThreadId, "+15551234567");
    assert.equal(envelopes[0]?.externalMessageId, "SM1");
    assert.equal(envelopes[0]?.idempotencyKey, "sms:inbound:SM1");
  });

  it("parses status callback into message.status", () => {
    const adapter = new TwilioSmsAdapter();
    const envelopes = adapter.parseWebhookEvents(ctx, {
      MessageSid: "SM1",
      MessageStatus: "delivered",
      To: "+15551234567",
      From: "+15557654321",
    });
    assert.equal(envelopes[0]?.eventType, "message.status");
    assert.equal((envelopes[0]?.payload as { deliveryStatus?: string }).deliveryStatus, "delivered");
  });

  it("rejects outbound without E.164 destination", () => {
    const adapter = new TwilioSmsAdapter();
    assert.throws(
      () =>
        adapter.formatOutbound(ctx, {
          conversationId: "conv-1",
          companyChannelId: "cc-sms-1",
          channelKey: "sms",
          externalThreadId: "not-a-phone",
          text: "hi",
        }),
      /E\.164/,
    );
  });

  it("sendOutbound fails without credentials loader (no fake success)", async () => {
    const adapter = new TwilioSmsAdapter();
    await assert.rejects(
      () => adapter.sendOutbound(ctx, { to: "+15551234567", body: "hi" }),
      /credentials loader/i,
    );
  });

  it("sendOutbound succeeds only with live Twilio response SID", async () => {
    const adapter = new TwilioSmsAdapter({
      credentialsLoader: {
        loadByCompanyId: async () => ({
          accountSid: "ACxxx",
          authToken: "token",
          fromNumber: "+15557654321",
          enabled: true,
          provider: "twilio",
        }),
      },
      fetchFn: async () =>
        new Response(JSON.stringify({ sid: "SM999", status: "queued" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
    });
    const result = await adapter.sendOutbound(ctx, { to: "+15551234567", body: "hi" });
    assert.equal(result.externalMessageId, "SM999");
  });

  it("sendOutbound surfaces Twilio auth failure (no fake success)", async () => {
    const adapter = new TwilioSmsAdapter({
      credentialsLoader: {
        loadByCompanyId: async () => ({
          accountSid: "ACxxx",
          authToken: "bad",
          fromNumber: "+15557654321",
          enabled: true,
          provider: "twilio",
        }),
      },
      fetchFn: async () =>
        new Response(JSON.stringify({ message: "Authenticate", code: 20003 }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
    });
    await assert.rejects(() => adapter.sendOutbound(ctx, { to: "+15551234567", body: "hi" }), /Authenticate|401|Twilio/i);
  });
});
