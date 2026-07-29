import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMetaMessagingWebhookEvents } from "./meta-messaging-webhook.js";

describe("parseMetaMessagingWebhookEvents batching", () => {
  it("returns message and delivery events from one payload", () => {
    const events = parseMetaMessagingWebhookEvents(
      {
        object: "page",
        entry: [
          {
            id: "page-1",
            messaging: [
              {
                sender: { id: "user-1" },
                recipient: { id: "page-1" },
                timestamp: 100,
                message: { mid: "mid-1", text: "hi" },
              },
              {
                sender: { id: "page-1" },
                recipient: { id: "user-1" },
                timestamp: 101,
                delivery: { mids: ["mid-out-1"], watermark: 101 },
              },
            ],
          },
        ],
      },
      "page",
    );

    assert.equal(events.length, 2);
    assert.equal(events[0]?.kind, "message");
    assert.equal(events[1]?.kind, "status");
  });
});
