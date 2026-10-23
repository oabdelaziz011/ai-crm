import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createFakeQuoteSendDispatchController,
  isLocalFakeQuoteSendProviderEnabled,
  withLocalFakeQuoteSendPorts,
} from "./fake-quote-send-dispatch.js";
import type { QuoteSendPorts } from "./quote-send-service.js";

function basePorts(overrides: Partial<QuoteSendPorts> = {}): QuoteSendPorts {
  return {
    async loadQuote() {
      return null;
    },
    async loadCompanyIdentity() {
      return { name: "Co", logoUrl: null, contactEmail: null, contactPhone: null };
    },
    async resolveRecipient() {
      return {
        customerId: null,
        leadId: null,
        name: "Contact",
        email: null,
        phone: null,
      };
    },
    async isChannelEntitled() {
      return false;
    },
    async findEmailChannel() {
      return null;
    },
    async resolveWhatsAppRoute() {
      return { ok: false, reason: "no_whatsapp_channel" };
    },
    async findAttemptByKey() {
      return null;
    },
    async closeStalePendingAttempts() {},
    async createPendingAttempt() {
      return { conflict: "pending_exists" };
    },
    async completeAttempt() {},
    async createEmailConversation() {
      throw new Error("real createEmailConversation must not run");
    },
    async dispatch() {
      throw new Error("real dispatch must not run");
    },
    async markQuoteSent() {
      return { status: "sent", sentAt: new Date().toISOString() };
    },
    async addQuoteHistory() {},
    ...overrides,
  };
}

describe("FakeQuoteSendDispatchController", () => {
  it("records success without network and returns delivery ids", async () => {
    const fake = createFakeQuoteSendDispatchController({ mode: "success" });
    const result = await fake.dispatch({
      companyId: "c1",
      conversationId: "conv",
      companyChannelId: "ch",
      channelKey: "email",
      channelSessionId: "sess",
      externalThreadId: "thread",
      text: "hello",
      metadata: {
        quoteId: "q1",
        quoteSendAttemptId: "a1",
        recipientEmail: "quote.recipient@valueor-test.local",
      },
    });
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0]?.channelKey, "email");
    assert.equal(fake.calls[0]?.quoteId, "q1");
    assert.match(result.externalMessageId ?? "", /^[0-9a-f-]{36}$/i);
    assert.equal(result.deliveryStatus, "sent");
  });

  it("fails on demand for provider failure scenarios", async () => {
    const fake = createFakeQuoteSendDispatchController({ mode: "fail", failMessage: "boom" });
    await assert.rejects(() => fake.dispatch({
      companyId: "c1",
      conversationId: "conv",
      companyChannelId: "ch",
      channelKey: "whatsapp",
      channelSessionId: "sess",
      externalThreadId: "1",
      text: "hi",
      metadata: {},
    }), /boom/);
    assert.equal(fake.calls.length, 1);
  });
});

describe("withLocalFakeQuoteSendPorts", () => {
  it("entitles channels, fills disposable recipients, and routes dispatch to fake", async () => {
    const fake = createFakeQuoteSendDispatchController();
    const ports = withLocalFakeQuoteSendPorts(basePorts(), fake);

    assert.equal(await ports.isChannelEntitled("c1", "email"), true);
    const email = await ports.findEmailChannel("c1");
    assert.ok(email?.fromEmail?.endsWith("@valueor-test.local"));

    const recipient = await ports.resolveRecipient("c1", {
      id: "q",
      companyId: "c1",
      quoteNumber: "Q-1",
      title: "T",
      status: "draft",
      currency: "EGP",
      language: "en",
      contactName: "N",
      validUntil: null,
      subtotal: 1,
      discountTotal: 0,
      taxTotal: 0,
      shippingTotal: 0,
      grandTotal: 1,
      notes: "",
      customerId: null,
      opportunityId: null,
      createdAt: new Date().toISOString(),
      lines: [],
    });
    assert.equal(recipient.email, "quote.recipient@valueor-test.local");

    const conv = await ports.createEmailConversation({
      companyId: "c1",
      companyChannelId: email!.companyChannelId,
      fromEmail: email!.fromEmail!,
      subject: "s",
      quoteId: "q",
      recipient,
    });
    assert.ok(conv.conversationId);

    await ports.dispatch({
      companyId: "c1",
      conversationId: conv.conversationId,
      companyChannelId: email!.companyChannelId,
      channelKey: "email",
      channelSessionId: conv.channelSessionId,
      externalThreadId: conv.externalThreadId,
      text: "body",
      metadata: { quoteId: "q" },
    });
    assert.equal(fake.calls.length, 1);
  });
});

describe("isLocalFakeQuoteSendProviderEnabled", () => {
  it("requires local VALUEOR_ENV and explicit VALUEOR_QUOTE_SEND_FAKE_PROVIDER=1", () => {
    const prevEnv = process.env.VALUEOR_ENV;
    const prevFake = process.env.VALUEOR_QUOTE_SEND_FAKE_PROVIDER;
    try {
      process.env.VALUEOR_ENV = "local";
      process.env.VALUEOR_QUOTE_SEND_FAKE_PROVIDER = "1";
      assert.equal(isLocalFakeQuoteSendProviderEnabled(), true);

      process.env.VALUEOR_QUOTE_SEND_FAKE_PROVIDER = "0";
      assert.equal(isLocalFakeQuoteSendProviderEnabled(), false);

      process.env.VALUEOR_ENV = "production";
      process.env.VALUEOR_QUOTE_SEND_FAKE_PROVIDER = "1";
      assert.equal(isLocalFakeQuoteSendProviderEnabled(), false);
    } finally {
      if (prevEnv === undefined) delete process.env.VALUEOR_ENV;
      else process.env.VALUEOR_ENV = prevEnv;
      if (prevFake === undefined) delete process.env.VALUEOR_QUOTE_SEND_FAKE_PROVIDER;
      else process.env.VALUEOR_QUOTE_SEND_FAKE_PROVIDER = prevFake;
    }
  });
});
