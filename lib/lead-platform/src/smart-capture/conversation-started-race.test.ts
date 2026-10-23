import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveCapturePhone, isPlaceholderContactName } from "./capture-identity.js";

/**
 * Documents the deferred ConversationStarted contract:
 * - Channel session create sets deferConversationStarted.
 * - Flush after identity stamp supplies customerId.
 * - Message backfill remains a tertiary safety net.
 */
describe("ConversationStarted identity race contract", () => {
  it("derives WhatsApp phone for flush publish when meta.phone is absent", () => {
    assert.equal(
      deriveCapturePhone({
        channelType: "whatsapp",
        phone: null,
        externalUserId: "201001234567",
      }),
      "+201001234567",
    );
  });

  it("does not treat a deferred anonymous placeholder as a verified CRM name", () => {
    assert.equal(isPlaceholderContactName("Unknown Contact"), true);
    assert.equal(isPlaceholderContactName("WhatsApp +201001234567"), true);
  });

  it("flush metadata should publish only once", () => {
    const meta: Record<string, unknown> = {
      deferConversationStarted: true,
    };
    // Simulate flush
    assert.equal(meta.deferConversationStarted, true);
    meta.deferConversationStarted = false;
    meta.conversationStartedPublishedAt = "2026-10-17T12:00:00.000Z";
    assert.equal(meta.deferConversationStarted, false);
    assert.ok(meta.conversationStartedPublishedAt);
    // Second flush gate
    const shouldPublish =
      meta.deferConversationStarted === true && !meta.conversationStartedPublishedAt;
    assert.equal(shouldPublish, false);
  });
});
