import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  draftWebhookVerifyTokenFromSettings,
  isCopyableWebhookVerifyToken,
  isMaskedSecretDisplayValue,
} from "./webhook-verify-token-field";

describe("webhook-verify-token-field helpers", () => {
  it("detects masked display values from the public settings RPC", () => {
    assert.equal(isMaskedSecretDisplayValue(""), false);
    assert.equal(isMaskedSecretDisplayValue("********"), true);
    assert.equal(isMaskedSecretDisplayValue("****************"), true);
    assert.equal(isMaskedSecretDisplayValue("****************ab12"), true);
    assert.equal(isMaskedSecretDisplayValue("messenger_verify_abc123"), false);
    assert.equal(isMaskedSecretDisplayValue("ig_verify_deadbeef"), false);
    assert.equal(isMaskedSecretDisplayValue("vo_ms_aabbccddeeff001122334455"), false);
  });

  it("allows copy only for plaintext tokens, never masks", () => {
    assert.equal(isCopyableWebhookVerifyToken(""), false);
    assert.equal(isCopyableWebhookVerifyToken("****************ab12"), false);
    assert.equal(isCopyableWebhookVerifyToken("********"), false);
    assert.equal(isCopyableWebhookVerifyToken("ig_verify_deadbeefcafebabe"), true);
    assert.equal(isCopyableWebhookVerifyToken("  messenger_verify_abc  "), true);
  });

  it("hydrates draft as empty when settings return a mask (keep-on-save)", () => {
    assert.equal(draftWebhookVerifyTokenFromSettings("****************zz99"), "");
    assert.equal(draftWebhookVerifyTokenFromSettings(""), "");
    assert.equal(
      draftWebhookVerifyTokenFromSettings("ig_verify_only_if_plaintext_ever_returned"),
      "ig_verify_only_if_plaintext_ever_returned",
    );
  });

  it("copyable plaintext equals the exact string that would be persisted (trimmed)", () => {
    const generated = "messenger_verify_aabbccddeeff0011223344556677";
    assert.equal(isCopyableWebhookVerifyToken(generated), true);
    assert.equal(generated.trim(), generated);
    assert.notEqual(generated, "****************6677");
  });
});
