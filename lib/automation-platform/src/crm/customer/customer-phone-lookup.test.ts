import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCustomerPhoneLookupAttempts } from "./customer-phone-lookup.js";

function keys(lookupBy: "phone" | "phone_e164" | "email" | "customer_id", value: string) {
  return buildCustomerPhoneLookupAttempts(lookupBy, value).map(
    (attempt) => `${attempt.lookupBy}:${attempt.lookupValue}`,
  );
}

describe("buildCustomerPhoneLookupAttempts", () => {
  it("searches canonical phone_e164 before legacy phone variants", () => {
    const attempts = keys("phone", "+201023169075");
    assert.equal(attempts[0], "phone_e164:+201023169075");
    assert.ok(attempts.includes("phone:01023169075"));
    assert.ok(attempts.includes("phone:+201023169075"));
    assert.ok(attempts.includes("phone:201023169075"));
    assert.equal(
      attempts.findIndex((item) => item.startsWith("phone_e164:")),
      0,
    );
    assert.ok(attempts.every((item) => !item.startsWith("phone_e164:") || item === "phone_e164:+201023169075"));
  });

  it("resolves national Egypt input to the same canonical e164 then variants", () => {
    const attempts = keys("phone", "01023169075");
    assert.equal(attempts[0], "phone_e164:+201023169075");
    assert.ok(attempts.includes("phone:01023169075"));
  });

  it("resolves Meta-style 2010… digits to canonical e164", () => {
    const attempts = keys("phone_e164", "201023169075");
    assert.equal(attempts[0], "phone_e164:+201023169075");
    assert.ok(attempts.includes("phone:01023169075"));
  });

  it("does not use last-9 digit-equivalent matching", () => {
    const attempts = keys("phone", "+201023169075");
    assert.equal(attempts.includes("phone:023169075"), false);
    assert.equal(attempts.includes("phone_e164:023169075"), false);
    assert.equal(attempts.some((item) => item.endsWith(":023169075")), false);
  });

  it("does not assume Egypt for a non-Egyptian E.164", () => {
    const attempts = keys("phone", "+14155552671");
    assert.equal(attempts[0], "phone_e164:+14155552671");
    assert.equal(attempts.includes("phone:01023169075"), false);
    assert.equal(attempts.some((item) => item.includes("010") || item.includes("+20")), false);
    assert.ok(attempts.includes("phone:+14155552671"));
  });

  it("leaves email lookups exact and unchanged", () => {
    assert.deepEqual(buildCustomerPhoneLookupAttempts("email", "a@b.com"), [
      { lookupBy: "email", lookupValue: "a@b.com" },
    ]);
  });

  it("leaves customer_id lookups exact and unchanged", () => {
    assert.deepEqual(buildCustomerPhoneLookupAttempts("customer_id", "cust-1"), [
      { lookupBy: "customer_id", lookupValue: "cust-1" },
    ]);
  });
});
