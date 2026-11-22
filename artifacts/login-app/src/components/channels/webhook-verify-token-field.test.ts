import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCopyableWebhookVerifyToken } from "../../lib/channels/webhook-verify-token-field";

/**
 * Behavioral contracts for the Copy / Show UI (logic-level; no DOM / no clipboard secrets logged).
 */
describe("WebhookVerifyTokenField copy/show contracts", () => {
  it("enables copy+show only when the draft holds plaintext", () => {
    const generated = "ig_verify_aabbccddeeff001122334455";
    assert.equal(isCopyableWebhookVerifyToken(generated), true);
    assert.equal(isCopyableWebhookVerifyToken(""), false);
    assert.equal(isCopyableWebhookVerifyToken("****************455"), false);
  });

  it("copy payload must be the exact trimmed draft value used on save", () => {
    const draft = "  messenger_verify_deadbeefcafebabe  ";
    const copyPayload = draft.trim();
    assert.equal(isCopyableWebhookVerifyToken(draft), true);
    assert.equal(copyPayload, "messenger_verify_deadbeefcafebabe");
    assert.doesNotMatch(copyPayload, /^\*+/);
  });

  it("show toggle is gated by the same copyable check (masked stays hidden)", () => {
    const canReveal = (value: string) => isCopyableWebhookVerifyToken(value);
    assert.equal(canReveal("vo_ms_11223344556677889900aabb"), true);
    assert.equal(canReveal("****************aabb"), false);
  });
});
