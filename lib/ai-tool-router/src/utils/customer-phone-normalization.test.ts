import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  convertArabicDigitsToAscii,
  extractPhoneFromCustomerText,
  validateEgyptMobilePhone,
} from "./customer-phone-normalization.js";

describe("customer-phone-normalization", () => {
  it("converts Arabic-Indic digits to ASCII", () => {
    assert.equal(convertArabicDigitsToAscii("٠١٠١٢٣٤٥٦٧٨"), "01012345678");
  });

  it("validates complete Egyptian mobile", () => {
    const result = validateEgyptMobilePhone("01012345678");
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.local, "01012345678");
      assert.equal(result.normalized, "201012345678");
    }
  });

  it("accepts Arabic-Indic complete mobile", () => {
    const result = validateEgyptMobilePhone("٠١٠١٢٣٤٥٦٧٨");
    assert.equal(result.valid, true);
  });

  it("rejects incomplete Egyptian mobile", () => {
    const result = validateEgyptMobilePhone("010133637");
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "incomplete");
  });

  it("extracts phone from Arabic name+phone line", () => {
    const phone = extractPhoneFromCustomerText("عمر مجدي ٠١٠١٢٣٤٥٦٧٨");
    assert.equal(phone, "201012345678");
  });

  it("does not treat calendar date as phone", () => {
    assert.equal(extractPhoneFromCustomerText("24-08-2026"), null);
  });

  it("does not store incomplete Arabic mobile as a phone candidate", () => {
    assert.equal(extractPhoneFromCustomerText("٠١٠١٣٣٦٣٧"), null);
    assert.equal(extractPhoneFromCustomerText("010133637"), null);
  });
});
