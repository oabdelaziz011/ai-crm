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

  it("M) exact phone_e164 beats last-9 compatibility", () => {
    const canonical = pickCanonicalCustomerIdFromPhoneMatches(
      [
        { id: "e164-owner", phone: "01023169075", phoneE164: "+201023169075" },
        { id: "last9-other", phone: "9661023169075", phoneE164: "+9661023169075" },
      ],
      new Map([
        ["e164-owner", 0],
        ["last9-other", 99],
      ]),
    );
    // Distinct e164 identities must not collapse via last-9 even if suffix overlaps.
    assert.equal(canonical, null);
  });

  it("L) last-9 remains only when no e164 identities are present", () => {
    const canonical = pickCanonicalCustomerIdFromPhoneMatches(
      [
        { id: "local", phone: "01023169075", phoneE164: null },
        { id: "cc", phone: "201023169075", phoneE164: null },
      ],
      new Map([
        ["local", 1],
        ["cc", 3],
      ]),
    );
    assert.equal(canonical, "cc");
  });

  it("exact shared e164 collapses without consulting last-9", () => {
    const canonical = pickCanonicalCustomerIdFromPhoneMatches(
      [
        { id: "a", phone: "01023169075", phoneE164: "+201023169075" },
        { id: "b", phone: "+201023169075", phoneE164: "+201023169075" },
      ],
      new Map([
        ["a", 2],
        ["b", 5],
      ]),
    );
    assert.equal(canonical, "b");
  });
});
