import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideWhatsAppQueueFailure } from "./whatsapp-send-outcome.ts";

describe("decideWhatsAppQueueFailure", () => {
  it("does not resend after the provider returns an id", () => {
    assert.deepEqual(
      decideWhatsAppQueueFailure({
        providerAttempted: true,
        acceptedMessageId: "wamid.accepted",
        confirmedRejection: false,
      }),
      { action: "complete_without_resend", messageId: "wamid.accepted" },
    );
  });

  it("does not resend when the transport result is unknown", () => {
    assert.deepEqual(
      decideWhatsAppQueueFailure({
        providerAttempted: true,
        acceptedMessageId: null,
        confirmedRejection: false,
      }),
      { action: "hold_without_resend" },
    );
  });

  it("retries only a confirmed Graph rejection or a failure before the provider call", () => {
    assert.deepEqual(
      decideWhatsAppQueueFailure({
        providerAttempted: true,
        acceptedMessageId: null,
        confirmedRejection: true,
      }),
      { action: "retry_proven_rejection" },
    );
    assert.deepEqual(
      decideWhatsAppQueueFailure({
        providerAttempted: false,
        acceptedMessageId: null,
        confirmedRejection: false,
      }),
      { action: "retry_proven_rejection" },
    );
  });
});
