import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractPurchaseContact,
  extractSingleEgyptianMobileE164,
  messageHasExplicitPurchase,
} from "./explicit-purchase.js";

describe("explicit purchase identity", () => {
  it("normalizes an Egyptian mobile that is already in the message", () => {
    const text = "My name is Sara Buyer. Email sara.buyer@example.test. Mobile 01053767770. I want to buy.";
    assert.equal(extractSingleEgyptianMobileE164(text), "+201053767770");
    const contact = extractPurchaseContact(text);
    assert.equal(contact.name, "Sara Buyer");
    assert.equal(contact.email, "sara.buyer@example.test");
    assert.equal(contact.phoneE164, "+201053767770");
    assert.equal(messageHasExplicitPurchase([text]), true);
  });

  it("does not invent a number or collapse two different mobiles", () => {
    assert.equal(extractSingleEgyptianMobileE164("call me tomorrow"), null);
    assert.equal(extractSingleEgyptianMobileE164("01011111111 or 01022222222"), null);
  });

  it("does not treat a price question as a purchase", () => {
    assert.equal(messageHasExplicitPurchase(["How much is the Sprint Verify Widget?"]), false);
    assert.equal(messageHasExplicitPurchase(["عايز اعرف سعر السماعات"]), false);
    assert.equal(messageHasExplicitPurchase(["Please prepare a quote for one widget"]), true);
  });
});
