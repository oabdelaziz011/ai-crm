import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerPhonesDigitEquivalent,
  pickCanonicalCustomerIdFromPhoneMatches,
} from "./customer-phone-collapse.js";

describe("customer phone digit collapse", () => {
  it("treats 010… and 2010… as the same national number", () => {
    assert.equal(customerPhonesDigitEquivalent("01023169075", "201023169075"), true);
    assert.equal(customerPhonesDigitEquivalent("01023169075", "01099999999"), false);
  });

  it("collapses digit-equivalent duplicates to the customer with more bookings", () => {
    const canonical = pickCanonicalCustomerIdFromPhoneMatches(
      [
        { id: "nessma", phone: "01023169075" },
        { id: "trusted", phone: "201023169075" },
      ],
      new Map([
        ["nessma", 0],
        ["trusted", 11],
      ]),
    );
    assert.equal(canonical, "trusted");
  });

  it("returns null when matches are distinct phone identities", () => {
    const canonical = pickCanonicalCustomerIdFromPhoneMatches(
      [
        { id: "a", phone: "01023169075" },
        { id: "b", phone: "01099999999" },
      ],
      new Map([
        ["a", 5],
        ["b", 5],
      ]),
    );
    assert.equal(canonical, null);
  });
});
