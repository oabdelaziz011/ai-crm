import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isUnchangedWhatsAppSecret,
  normalizeWhatsAppSecretForUpsert,
  whatsappSecretInputMeta,
} from "./whatsapp-secret-input.ts";

describe("whatsapp-secret-input", () => {
  it("treats empty and classic masks as unchanged", () => {
    assert.equal(isUnchangedWhatsAppSecret(""), true);
    assert.equal(isUnchangedWhatsAppSecret("   "), true);
    assert.equal(isUnchangedWhatsAppSecret("********"), true);
    assert.equal(isUnchangedWhatsAppSecret("****************"), true);
    assert.equal(isUnchangedWhatsAppSecret("****************Kh9Q"), true);
  });

  it("treats real Meta access tokens as changed", () => {
    const token = `EAAPiIyKkh9Q${"x".repeat(200)}`;
    assert.equal(isUnchangedWhatsAppSecret(token), false);
    assert.equal(normalizeWhatsAppSecretForUpsert(token), token);
    assert.deepEqual(whatsappSecretInputMeta(token), {
      present: true,
      length: token.length,
      isUnchangedMask: false,
      prefix: "EAAPiIyKkh9Q",
    });
  });

  it("normalizes masks to empty for upsert", () => {
    assert.equal(normalizeWhatsAppSecretForUpsert("****************Kh9Q"), "");
    assert.equal(normalizeWhatsAppSecretForUpsert(""), "");
  });
});
