import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ChannelAdapterContext,
  ChannelAdapterPort,
  ChannelAdapterSendResult,
} from "../ports/channel-adapter-port.js";
import type {
  NormalizedInboundMessageDto,
  OutboundChannelMessageDto,
  WebhookEnvelopeDto,
} from "../dto/channel-dto.js";
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import { createContext, createTestEnvironment } from "../test-utils.js";
import {
  abandonConversationTurnForTests,
  readConversationTurnWaitExceededCount,
  resetConversationTurnWaitExceededForTests,
  setConversationTurnMaxWaitMsForTests,
  waitForConversationTurn,
} from "./inbound-message-pipeline.js";

class StubWhatsAppAdapter implements ChannelAdapterPort {
  readonly channelKey = "whatsapp";
  sentTexts: string[] = [];
  sendCalls = 0;
  failBeforeAccept = false;
  sendHold: ((text: string) => Promise<void>) | undefined;

  parseWebhook(_ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto {
    return {
      eventType: "message.received",
      companyChannelId: "company-channel-wa-1",
      channelKey: this.channelKey,
      idempotencyKey: String(rawPayload.externalMessageId ?? "wamid.in"),
      externalThreadId: String(rawPayload.externalThreadId ?? "201011404109"),
      payload: rawPayload,
    };
  }

  normalizeInbound(_ctx: ChannelAdapterContext, payload: Record<string, unknown>): NormalizedInboundMessageDto {
    return {
      externalThreadId: String(payload.externalThreadId ?? "201011404109"),
      externalMessageId: String(payload.externalMessageId ?? "wamid.in"),
      senderExternalId: String(payload.senderExternalId ?? "201011404109"),
      text: String(payload.text ?? ""),
      attachments: [],
      metadata: {},
    };
  }

  formatOutbound(_ctx: ChannelAdapterContext, message: OutboundChannelMessageDto): Record<string, unknown> {
    return { to: message.externalThreadId, text: message.text };
  }

  async sendOutbound(
    _ctx: ChannelAdapterContext,
    formattedPayload: Record<string, unknown>,
  ): Promise<ChannelAdapterSendResult> {
    this.sendCalls += 1;
    const text = String(formattedPayload.text ?? "");
    if (this.sendHold) await this.sendHold(text);
    if (this.failBeforeAccept) {
      throw new Error("crashed_before_provider_acceptance");
    }
    this.sentTexts.push(text);
    const id = `wamid.out-${this.sentTexts.length}`;
    return { externalMessageId: id, providerResponse: { messages: [{ id }] } };
  }
}

const employeeRuntime = {
  async resolveForInboundChannel(input: { companyId: string }) {
    if (input.companyId !== "company-1") return null;
    return {
      aiEmployeeId: "emp-wa-1",
      conversationMetadataSeed: { aiEmployeeId: "emp-wa-1" },
      sessionTimeoutMinutes: 1440,
    };
  },
  async resolveSessionTimeoutMinutes() {
    return 1440;
  },
  async resolveWhatsAppDeterministicWelcome() {
    return null;
  },
  async prepareForConversation() {
    return {
      runtimeConfig: { providerConnectionId: "provider-1", pageContext: { systemPrompt: "You are helpful." } },
      metadataPatch: { aiEmployeeId: "emp-wa-1" },
    };
  },
} satisfies NonNullable<ChannelPlatformPorts["employeeRuntime"]>;

function whatsAppEnv(
  runtimeHold?: (input: { messageText: string }) => Promise<void>,
  prepareHold?: () => Promise<void>,
) {
  const adapter = new StubWhatsAppAdapter();
  const env = createTestEnvironment({
    companyChannel: {
      id: "company-channel-wa-1",
      companyId: "company-1",
      channelKey: "whatsapp",
      displayName: "WhatsApp",
      provider: "meta",
      configuration: { phoneNumberId: "123456789" },
    },
    adapters: [adapter],
    employeeRuntime: prepareHold
      ? {
          ...employeeRuntime,
          async prepareForConversation() {
            await prepareHold();
            return employeeRuntime.prepareForConversation();
          },
        }
      : employeeRuntime,
    runtimeHold,
  });
  const send = (wamid: string, text: string) =>
    env.router.routeInbound(createContext(), {
      companyId: "company-1",
      companyChannelId: env.companyChannel.id,
      channelKey: "whatsapp",
      source: "webhook",
      executeAi: true,
      idempotencyKey: wamid,
      externalThreadId: "201011404109",
      externalMessageId: wamid,
      payload: {
        text,
        externalThreadId: "201011404109",
        senderExternalId: "201011404109",
        externalMessageId: wamid,
      },
    });
  return { env, adapter, send };
}

async function until(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 400 && !condition(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(condition(), "condition never became true");
}

describe("InboundMessagePipeline WhatsApp message bursts", { concurrency: 1 }, () => {
  it("two quick customer messages get one AI reply, from the newer message's turn", async () => {
    let prepareCalls = 0;
    let releaseFirstPrepare!: () => void;
    const firstPrepareHeld = new Promise<void>((resolve) => {
      releaseFirstPrepare = resolve;
    });
    const { env, adapter, send } = whatsAppEnv(undefined, async () => {
      prepareCalls += 1;
      if (prepareCalls === 2) await firstPrepareHeld;
    });
    await send("wamid.burst-0", "مساء");
    assert.equal(env.runtimeCalls, 1);

    // The second message lands while the first is still being prepared, as in the live chat.
    const firstTurn = send("wamid.burst-1", "تقدر تساعدني في ايه");
    await until(() => prepareCalls === 2);
    const secondTurn = send("wamid.burst-2", "؟؟؟");
    await until(() => env.incomingMessages.length === 3);
    releaseFirstPrepare();
    const [first, second] = await Promise.all([firstTurn, secondTurn]);

    assert.equal(env.runtimeCalls, 2);
    assert.equal(adapter.sentTexts.length, 2);
    assert.equal(first.responseContent, undefined);
    assert.equal(second.responseContent, "Echo: ؟؟؟");
    assert.equal(env.inboundEvents.every((event) => event.processing_status === "processed"), true);
  });

  it("a message that arrives while a reply is being prepared waits for it, then gets its own reply", async () => {
    let releaseFirst!: () => void;
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const order: string[] = [];
    const { adapter, send } = whatsAppEnv(async ({ messageText }) => {
      order.push(`start:${messageText}`);
      if (messageText === "عايز احجز") await firstHeld;
      order.push(`end:${messageText}`);
    });
    await send("wamid.wait-0", "مساء");

    const first = send("wamid.wait-1", "عايز احجز");
    await until(() => order.includes("start:عايز احجز"));
    const second = send("wamid.wait-2", "مع ادم");
    for (let tick = 0; tick < 50; tick += 1) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(order.includes("start:مع ادم"), false);

    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(order.slice(2), ["start:عايز احجز", "end:عايز احجز", "start:مع ادم", "end:مع ادم"]);
    assert.equal(adapter.sentTexts.length, 3);
  });

  it("a newer bare greeting does not swallow the earlier message's reply", async () => {
    const { env, adapter, send } = whatsAppEnv();
    await send("wamid.greet-0", "مساء");
    await Promise.all([send("wamid.greet-1", "عايز احجز"), send("wamid.greet-2", "هاي")]);
    assert.ok(adapter.sentTexts.includes("Echo: عايز احجز"));
    assert.ok(env.runtimeCalls >= 2);
  });

  it("does not start a later turn when the wait budget expires during the first send", async () => {
    setConversationTurnMaxWaitMsForTests(25);
    resetConversationTurnWaitExceededForTests();
    let releaseSend!: () => void;
    const sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const started: string[] = [];
    const { adapter, send } = whatsAppEnv(async ({ messageText }) => {
      started.push(messageText);
    });
    adapter.sendHold = async (text) => {
      if (text.includes("عايز احجز")) await sendGate;
    };

    try {
      const first = send("wamid.budget-1", "عايز احجز");
      await until(() => adapter.sendCalls === 1);
      const second = send("wamid.budget-2", "مع ادم");
      await until(() => readConversationTurnWaitExceededCount() >= 1);

      assert.ok(readConversationTurnWaitExceededCount() >= 1);
      assert.deepEqual(started, ["عايز احجز"]);
      assert.deepEqual(adapter.sentTexts, []);

      releaseSend();
      await Promise.all([first, second]);
      assert.deepEqual(started, ["عايز احجز", "مع ادم"]);
      assert.deepEqual(adapter.sentTexts, ["Echo: عايز احجز", "Echo: مع ادم"]);
    } finally {
      releaseSend();
      setConversationTurnMaxWaitMsForTests(120_000);
      resetConversationTurnWaitExceededForTests();
    }
  });

  it("keeps later messages queued during generation and send, then sends the ready reply before the newest turn", async () => {
    setConversationTurnMaxWaitMsForTests(20);
    resetConversationTurnWaitExceededForTests();
    let releaseRuntime!: () => void;
    const runtimeGate = new Promise<void>((resolve) => {
      releaseRuntime = resolve;
    });
    let releaseSend!: () => void;
    const sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const started: string[] = [];
    const { adapter, send } = whatsAppEnv(async ({ messageText }) => {
      started.push(messageText);
      if (messageText === "الاول") await runtimeGate;
    });
    adapter.sendHold = async (text) => {
      if (text.includes("الاول")) await sendGate;
    };

    try {
      const first = send("wamid.queue-1", "الاول");
      await until(() => started.includes("الاول"));
      const second = send("wamid.queue-2", "الثاني");
      const third = send("wamid.queue-3", "الثالث");
      await until(() => readConversationTurnWaitExceededCount() >= 1);
      assert.deepEqual(started, ["الاول"]);

      releaseRuntime();
      await until(() => adapter.sendCalls === 1);
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.deepEqual(started, ["الاول"]);
      assert.deepEqual(adapter.sentTexts, []);

      releaseSend();
      const [firstResult, secondResult, thirdResult] = await Promise.all([first, second, third]);
      assert.equal(firstResult.responseContent, "Echo: الاول");
      assert.equal(secondResult.responseContent, undefined);
      assert.equal(thirdResult.responseContent, "Echo: الثالث");
      assert.deepEqual(started, ["الاول", "الثالث"]);
      assert.deepEqual(adapter.sentTexts, ["Echo: الاول", "Echo: الثالث"]);
    } finally {
      releaseRuntime();
      releaseSend();
      setConversationTurnMaxWaitMsForTests(120_000);
      resetConversationTurnWaitExceededForTests();
    }
  });

  it("does not send after the turn owner dies, and the next turn can take the lease", async () => {
    setConversationTurnMaxWaitMsForTests(40);
    resetConversationTurnWaitExceededForTests();
    let releaseRuntime!: () => void;
    const runtimeGate = new Promise<void>((resolve) => {
      releaseRuntime = resolve;
    });
    const started: string[] = [];
    const { adapter, send } = whatsAppEnv(async ({ messageText }) => {
      started.push(messageText);
      if (messageText === "الاول") await runtimeGate;
    });

    try {
      const first = send("wamid.dead-1", "الاول");
      await until(() => started.includes("الاول"));
      abandonConversationTurnForTests("conv-1");
      releaseRuntime();
      const second = send("wamid.dead-2", "الثاني");
      const [firstResult, secondResult] = await Promise.all([first, second]);

      assert.equal(firstResult.outboundError, "conversation_turn_lease_lost");
      assert.equal(adapter.sentTexts.includes("Echo: الاول"), false);
      assert.equal(secondResult.responseContent, "Echo: الثاني");
      assert.deepEqual(adapter.sentTexts, ["Echo: الثاني"]);
      const staleRelease = await waitForConversationTurn("conv-1");
      abandonConversationTurnForTests("conv-1");
      const replacement = await waitForConversationTurn("conv-1");
      staleRelease.release();
      assert.equal(replacement.stillOwns(), true);
      replacement.release();
    } finally {
      releaseRuntime();
      setConversationTurnMaxWaitMsForTests(120_000);
      resetConversationTurnWaitExceededForTests();
    }
  });

  it("does not send again when the same wamid is redelivered after a crash before provider acceptance", async () => {
    const { env, adapter, send } = whatsAppEnv();
    adapter.failBeforeAccept = true;

    const first = await send("wamid.crash-1", "عايز احجز");
    assert.equal(adapter.sendCalls, 1);
    assert.deepEqual(adapter.sentTexts, []);
    assert.equal(first.outboundError, "crashed_before_provider_acceptance");
    assert.equal(env.inboundEvents[0]?.processing_status, "processed");

    const replay = await send("wamid.crash-1", "عايز احجز");
    assert.equal(replay.duplicate, true);
    assert.equal(adapter.sendCalls, 1);
    assert.deepEqual(adapter.sentTexts, []);
  });

  it("does not send another reply when the same inbound is redelivered", async () => {
    const { adapter, send } = whatsAppEnv();
    await send("wamid.once", "عايز احجز");
    assert.equal(adapter.sentTexts.length, 1);
    assert.equal(adapter.sentTexts[0], "Echo: عايز احجز");

    const replay = await send("wamid.once", "عايز احجز");
    assert.equal(replay.duplicate, true);
    assert.equal(adapter.sentTexts.length, 1);
  });

  it("turns for different conversations don't wait on each other", async () => {
    const leaseA = await waitForConversationTurn("conversation-a");
    const leaseB = await waitForConversationTurn("conversation-b");
    let thirdStarted = false;
    const third = waitForConversationTurn("conversation-a").then((lease) => {
      thirdStarted = true;
      return lease;
    });
    for (let tick = 0; tick < 20; tick += 1) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(thirdStarted, false);
    leaseA.release();
    (await third).release();
    leaseB.release();
    assert.equal(thirdStarted, true);
  });
});
