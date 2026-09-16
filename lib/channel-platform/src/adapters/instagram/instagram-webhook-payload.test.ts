import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InstagramCloudAdapter } from "./instagram-cloud-adapter.js";
import { parseInstagramWebhookEvents } from "./instagram-api-client.js";
import {
  describeInstagramWebhookShape,
  normalizeInstagramWebhookPayload,
} from "./instagram-webhook-payload.js";
import { parseMetaMessagingWebhookEvents } from "../meta/meta-messaging-webhook.js";

const ACCOUNT_ID = "17841435877386136";
const SENDER_ID = "12345678901234567";

function classicDm(overrides: Record<string, unknown> = {}) {
  return {
    object: "instagram",
    entry: [
      {
        id: ACCOUNT_ID,
        time: 1710000000,
        messaging: [
          {
            sender: { id: SENDER_ID },
            recipient: { id: ACCOUNT_ID },
            timestamp: 1710000000,
            message: {
              mid: "mid.real-dm",
              text: "hello instagram",
            },
            ...overrides,
          },
        ],
      },
    ],
  };
}

describe("Instagram Login webhook DM normalization", () => {
  it("still routes the classic sender/message.mid payload", () => {
    const events = parseInstagramWebhookEvents(classicDm());
    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, "message");
    if (events[0]?.kind === "message") {
      assert.equal(events[0].senderExternalId, SENDER_ID);
      assert.equal(events[0].externalMessageId, "mid.real-dm");
    }
  });

  it("routes Instagram DMs when IDs are numbers and message.id is used instead of mid", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: 178414358,
          time: 1710000000,
          messaging: [
            {
              sender: { id: 12345 },
              recipient: { id: 178414358 },
              timestamp: 1710000001,
              message: {
                id: "aWdGGiblWZ.message",
                text: "numeric ids",
              },
            },
          ],
        },
      ],
    };

    let sharedCount = 0;
    try {
      sharedCount = parseMetaMessagingWebhookEvents(payload, "instagram").length;
    } catch {
      sharedCount = 0;
    }
    assert.equal(sharedCount, 0);
    const events = parseInstagramWebhookEvents(payload);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, "message");
    if (events[0]?.kind === "message") {
      assert.equal(events[0].senderExternalId, "12345");
      assert.equal(events[0].externalMessageId, "aWdGGiblWZ.message");
      assert.equal(events[0].instagramBusinessAccountId, "178414358");
    }
  });

  it("routes Meta dashboard self-test DMs that set is_self and is_echo", () => {
    const payload = classicDm({
      message: {
        mid: "mid.self-test",
        text: "dashboard test",
        is_self: true,
        is_echo: true,
      },
    });

    assert.equal(parseMetaMessagingWebhookEvents(payload, "instagram").length, 0);
    const events = parseInstagramWebhookEvents(payload);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, "message");
  });

  it("routes a customer DM even when Instagram Login sets is_echo", () => {
    const events = parseInstagramWebhookEvents(
      classicDm({
        message: {
          mid: "mid.customer-echo-flag",
          text: "مرحبا",
          is_echo: true,
        },
      }),
    );
    assert.equal(events.length, 1);
    assert.equal(events[0]?.kind, "message");
    if (events[0]?.kind === "message") {
      assert.equal(events[0].senderExternalId, SENDER_ID);
      assert.equal(events[0].externalMessageId, "mid.customer-echo-flag");
    }
  });

  it("does not treat a true business echo as inbound", () => {
    const events = parseInstagramWebhookEvents(
      classicDm({
        sender: { id: ACCOUNT_ID },
        recipient: { id: SENDER_ID },
        message: {
          mid: "mid.echo",
          text: "outbound echo",
          is_echo: true,
        },
      }),
    );
    assert.equal(events.length, 0);
  });

  it("does not turn a reaction-only event into an inbound DM", () => {
    const events = parseInstagramWebhookEvents({
      object: "instagram",
      entry: [
        {
          id: ACCOUNT_ID,
          messaging: [
            {
              sender: { id: SENDER_ID },
              recipient: { id: ACCOUNT_ID },
              timestamp: 1710000000,
              reaction: { mid: "mid.other", action: "react", reaction: "love" },
            },
          ],
        },
      ],
    });
    assert.equal(events.length, 0);
  });

  it("maps a normalized DM through the Instagram adapter to message.received", () => {
    const adapter = new InstagramCloudAdapter();
    const envelopes = adapter.parseWebhookEvents(
      {
        companyChannel: {
          id: "channel-1",
          companyId: "company-1",
          channelKey: "instagram",
          configuration: {},
        },
      } as never,
      classicDm({
        message: {
          id: "mid.from-id",
          text: "adapter path",
          is_self: true,
          is_echo: true,
        },
      }),
    );

    assert.equal(envelopes.length, 1);
    assert.equal(envelopes[0]?.eventType, "message.received");
    assert.equal(envelopes[0]?.externalMessageId, "mid.from-id");
  });

  it("describes payload structure without message text or user ids", () => {
    const shape = describeInstagramWebhookShape(classicDm());
    const serialized = JSON.stringify(shape);
    assert.doesNotMatch(serialized, /hello instagram/);
    assert.doesNotMatch(serialized, new RegExp(SENDER_ID));
    assert.match(serialized, /"messageKeys"/);
    assert.equal((shape.entries as Array<{ messaging: Array<{ hasMessageText: boolean; senderIsEntryAccount: boolean | null }> }>)[0]?.messaging[0]?.hasMessageText, true);
    assert.equal((shape.entries as Array<{ messaging: Array<{ senderIsEntryAccount: boolean | null }> }>)[0]?.messaging[0]?.senderIsEntryAccount, false);
  });

  it("does not change Messenger/page parsing", () => {
    const pagePayload = {
      object: "page",
      entry: [
        {
          id: "page-1",
          messaging: [
            {
              sender: { id: "user-1" },
              recipient: { id: "page-1" },
              message: { mid: "mid-1", text: "hi" },
            },
          ],
        },
      ],
    };
    const events = parseMetaMessagingWebhookEvents(pagePayload, "page");
    assert.equal(events.length, 1);
    assert.equal(normalizeInstagramWebhookPayload(pagePayload).object, "page");
  });
});
