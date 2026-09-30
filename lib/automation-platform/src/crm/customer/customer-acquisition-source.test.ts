import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerSourceFromChannelType,
  normalizeCustomerAcquisitionSource,
} from "./customer-acquisition-source.js";

describe("customerSourceFromChannelType", () => {
  it("maps known channel types to CRM acquisition sources", () => {
    assert.equal(customerSourceFromChannelType("whatsapp"), "whatsapp");
    assert.equal(customerSourceFromChannelType("Messenger"), "messenger");
    assert.equal(customerSourceFromChannelType("instagram"), "instagram");
    assert.equal(customerSourceFromChannelType("email"), "email");
    assert.equal(customerSourceFromChannelType("sms"), "sms");
    assert.equal(customerSourceFromChannelType("web_chat"), "website");
    assert.equal(customerSourceFromChannelType("website"), "website");
    assert.equal(customerSourceFromChannelType("web"), "website");
    assert.equal(customerSourceFromChannelType("telegram"), "other");
    assert.equal(customerSourceFromChannelType("voice"), "other");
  });

  it("returns null for unknown or empty channels (caller falls back to manual)", () => {
    assert.equal(customerSourceFromChannelType("manual"), null);
    assert.equal(customerSourceFromChannelType(""), null);
    assert.equal(customerSourceFromChannelType(null), null);
    assert.equal(customerSourceFromChannelType(undefined), null);
    assert.equal(customerSourceFromChannelType("fax"), null);
  });
});

describe("normalizeCustomerAcquisitionSource", () => {
  it("accepts known sources and rejects unknown", () => {
    assert.equal(normalizeCustomerAcquisitionSource("manual"), "manual");
    assert.equal(normalizeCustomerAcquisitionSource(" WhatsApp "), "whatsapp");
    assert.equal(normalizeCustomerAcquisitionSource("referral"), null);
    assert.equal(normalizeCustomerAcquisitionSource(""), null);
  });
});
