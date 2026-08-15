import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  claimInteractiveReplyDedupe,
  extractInteractiveReplyContextIdFromPayload,
  extractInteractiveReplyIdFromPayload,
  resetInteractiveReplyDedupeForTests,
} from "./interactive-reply-dedupe.js";

describe("interactive-reply-dedupe", () => {
  it("extracts list reply ids from WhatsApp payload shape", () => {
    assert.equal(
      extractInteractiveReplyIdFromPayload({
        message: {
          type: "interactive",
          interactive: { list_reply: { id: "svc-1", title: "عيادة" } },
        },
      }),
      "svc-1",
    );
  });

  it("extracts context message id from interactive reply", () => {
    assert.equal(
      extractInteractiveReplyContextIdFromPayload({
        message: {
          type: "interactive",
          context: { id: "wamid.list-offer-1", from: "201012345989" },
          interactive: { list_reply: { id: "doctor-1", title: "ADAM" } },
        },
      }),
      "wamid.list-offer-1",
    );
  });

  it("claims the first interactive reply and rejects a second claim for the same list", () => {
    resetInteractiveReplyDedupeForTests();
    const input = {
      companyChannelId: "channel-1",
      externalThreadId: "201011404109",
      replyId: "svc-1",
      contextMessageId: "wamid.list-1",
      now: 1_000,
    };
    assert.equal(claimInteractiveReplyDedupe(input), true);
    assert.equal(claimInteractiveReplyDedupe({ ...input, now: 1_500 }), false);
    assert.equal(claimInteractiveReplyDedupe({ ...input, now: 70_000 }), true);
  });

  it("allows the same replyId on a different list context (pricing vs booking)", () => {
    resetInteractiveReplyDedupeForTests();
    const base = {
      companyChannelId: "channel-1",
      externalThreadId: "201011404109",
      replyId: "doctor-1",
      now: 1_000,
    };
    assert.equal(
      claimInteractiveReplyDedupe({ ...base, contextMessageId: "wamid.booking-doctors" }),
      true,
    );
    assert.equal(
      claimInteractiveReplyDedupe({ ...base, contextMessageId: "wamid.pricing-doctors", now: 1_500 }),
      true,
    );
  });
});
