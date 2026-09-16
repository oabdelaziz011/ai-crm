import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveInstagramAutomationPhone } from "./instagram-customer-phone.js";

describe("resolveInstagramAutomationPhone", () => {
  it("rewrites Instagram Egyptian local mobiles to E.164 with EG", () => {
    assert.deepEqual(
      resolveInstagramAutomationPhone({
        channel: "instagram",
        phone: "01098232123",
      }),
      { phone: "+201098232123", region: "EG" },
    );
  });

  it("leaves WhatsApp phones unchanged", () => {
    assert.deepEqual(
      resolveInstagramAutomationPhone({
        channel: "whatsapp",
        phone: "01098232123",
      }),
      { phone: "01098232123", region: null },
    );
  });

  it("keeps an explicit workflow region", () => {
    assert.deepEqual(
      resolveInstagramAutomationPhone({
        channel: "instagram",
        phone: "01098232123",
        configuredRegion: "sa",
      }),
      { phone: "+201098232123", region: "SA" },
    );
  });
});
