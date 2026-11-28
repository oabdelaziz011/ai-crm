import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMetaApprovedTemplateStatus,
  mapMetaWhatsAppTemplateStatus,
  normalizeWhatsAppTemplateLanguage,
  whatsappTemplateLanguagesMatch,
} from "./whatsapp-template-meta-status";

describe("whatsapp-template-meta-status", () => {
  it("maps Meta status strings", () => {
    assert.equal(mapMetaWhatsAppTemplateStatus("APPROVED"), "APPROVED");
    assert.equal(mapMetaWhatsAppTemplateStatus("pending"), "PENDING");
    assert.equal(mapMetaWhatsAppTemplateStatus("Rejected"), "REJECTED");
    assert.equal(mapMetaWhatsAppTemplateStatus("PAUSED"), "PAUSED");
    assert.equal(mapMetaWhatsAppTemplateStatus("in appeal"), "IN_APPEAL");
    assert.equal(mapMetaWhatsAppTemplateStatus(""), "UNKNOWN");
    assert.equal(mapMetaWhatsAppTemplateStatus("SOMETHING_NEW"), "UNKNOWN");
  });

  it("only APPROVED is sendable", () => {
    assert.equal(isMetaApprovedTemplateStatus("APPROVED"), true);
    assert.equal(isMetaApprovedTemplateStatus("PENDING"), false);
    assert.equal(isMetaApprovedTemplateStatus("REJECTED"), false);
    assert.equal(isMetaApprovedTemplateStatus("PAUSED"), false);
  });

  it("normalizes languages and matches base codes", () => {
    assert.equal(normalizeWhatsAppTemplateLanguage("en"), "en_US");
    assert.equal(normalizeWhatsAppTemplateLanguage("en-US"), "en_US");
    assert.equal(whatsappTemplateLanguagesMatch("en", "en_US"), true);
    assert.equal(whatsappTemplateLanguagesMatch("ar", "en_US"), false);
  });
});
