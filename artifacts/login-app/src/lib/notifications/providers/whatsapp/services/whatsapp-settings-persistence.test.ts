import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isUnchangedWhatsAppSecret,
  normalizeWhatsAppSecretForUpsert,
} from "./whatsapp-secret-input.ts";

describe("whatsapp settings callback + secret preservation contracts", () => {
  it("treats empty and masked secrets as unchanged for upsert", () => {
    assert.equal(normalizeWhatsAppSecretForUpsert(""), "");
    assert.equal(normalizeWhatsAppSecretForUpsert("********"), "");
    assert.equal(normalizeWhatsAppSecretForUpsert("****************2026"), "");
    assert.equal(isUnchangedWhatsAppSecret(""), true);
  });

  it("treats real tokens as replacements", () => {
    assert.equal(normalizeWhatsAppSecretForUpsert("EAABrealTokenValue"), "EAABrealTokenValue");
    assert.equal(isUnchangedWhatsAppSecret("EAABrealTokenValue"), false);
  });
});
