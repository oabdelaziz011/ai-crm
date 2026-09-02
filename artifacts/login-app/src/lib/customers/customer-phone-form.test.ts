/**
 * D5.2 — CRM phone form validation, edit preservation, country options (mocked / pure).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listPhoneCountryOptions } from "@workspace/ai-tool-router";
import {
  didCustomerPhoneChange,
  formatCustomerPhoneDisplay,
  validateCustomerPhoneFormInput,
} from "./customer-phone-form";

describe("D5.2 validateCustomerPhoneFormInput — create matrix", () => {
  const cases: Array<{ label: string; phone: string; region: string | null; e164: string }> = [
    { label: "EG local + EG", phone: "01023169075", region: "EG", e164: "+201023169075" },
    { label: "SA local + SA", phone: "0551234567", region: "SA", e164: "+966551234567" },
    { label: "AE local + AE", phone: "0501234567", region: "AE", e164: "+971501234567" },
    { label: "GB local + GB", phone: "07123456789", region: "GB", e164: "+447123456789" },
    { label: "US local + US", phone: "4155551234", region: "US", e164: "+14155551234" },
  ];

  for (const c of cases) {
    it(c.label, () => {
      const result = validateCustomerPhoneFormInput({ phone: c.phone, region: c.region });
      assert.equal(result.code, "ok");
      assert.equal(result.preview.phoneE164, c.e164);
      assert.equal(result.identity?.phone_e164, c.e164);
      assert.equal(result.identity?.phone_region_source, "explicit");
    });
  }

  it("E.164 without country", () => {
    const result = validateCustomerPhoneFormInput({
      phone: "+201023169075",
      region: null,
    });
    assert.equal(result.code, "ok");
    assert.equal(result.preview.phoneE164, "+201023169075");
    assert.equal(result.identity?.phone_region_source, "e164");
  });

  it("00 prefix resolves as E.164", () => {
    const result = validateCustomerPhoneFormInput({
      phone: "00201023169075",
      region: null,
    });
    assert.equal(result.code, "ok");
    assert.equal(result.preview.phoneE164, "+201023169075");
    assert.equal(result.identity?.phone_region_source, "e164");
  });

  it("Arabic digits with Egypt region", () => {
    const result = validateCustomerPhoneFormInput({
      phone: "٠١٠٢٣١٦٩٠٧٥",
      region: "EG",
    });
    assert.equal(result.code, "ok");
    assert.equal(result.preview.phoneE164, "+201023169075");
  });

  it("local without region blocked", () => {
    const result = validateCustomerPhoneFormInput({
      phone: "01023169075",
      region: null,
    });
    assert.equal(result.code, "phone_region_required");
    assert.equal(result.identity, null);
  });

  it("invalid blocked", () => {
    const result = validateCustomerPhoneFormInput({
      phone: "123",
      region: "EG",
    });
    assert.equal(result.code, "invalid_phone");
  });

  it("empty allowed as empty code", () => {
    const result = validateCustomerPhoneFormInput({ phone: "", region: null });
    assert.equal(result.code, "empty");
    assert.equal(result.identity?.phone_e164, null);
  });
});

describe("D5.2 edit preservation", () => {
  it("unrelated / unchanged phone does not count as change", () => {
    assert.equal(
      didCustomerPhoneChange({
        previousPhone: "01023169075",
        previousRegion: "EG",
        nextPhone: "01023169075",
        nextRegion: "EG",
      }),
      false,
    );
  });

  it("local phone change detected", () => {
    assert.equal(
      didCustomerPhoneChange({
        previousPhone: "01023169075",
        previousRegion: "EG",
        nextPhone: "0551234567",
        nextRegion: "EG",
      }),
      true,
    );
  });

  it("region-only change recomputes", () => {
    assert.equal(
      didCustomerPhoneChange({
        previousPhone: "0551234567",
        previousRegion: "SA",
        nextPhone: "0551234567",
        nextRegion: "AE",
      }),
      true,
    );
  });

  it("clearing phone is a change", () => {
    assert.equal(
      didCustomerPhoneChange({
        previousPhone: "01023169075",
        previousRegion: "EG",
        nextPhone: null,
        nextRegion: "EG",
      }),
      true,
    );
  });

  it("backfilled customer: untouched local+region preserves (no change flag)", () => {
    assert.equal(
      didCustomerPhoneChange({
        previousPhone: "01023169075",
        previousRegion: "EG",
        nextPhone: " 01023169075 ",
        nextRegion: "eg",
      }),
      false,
    );
  });
});

describe("D5.2 country options / display", () => {
  it("lists libphonenumber countries with calling codes (no hand list)", () => {
    const options = listPhoneCountryOptions();
    assert.ok(options.length > 200);
    const eg = options.find((o) => o.iso === "EG");
    assert.ok(eg);
    assert.equal(eg?.callingCode, "20");
    const sa = options.find((o) => o.iso === "SA");
    assert.equal(sa?.callingCode, "966");
  });

  it("display prefers stored e164 international without Egypt-guessing legacy", () => {
    const withIdentity = formatCustomerPhoneDisplay({
      phone: "01023169075",
      phone_e164: "+201023169075",
      phone_country_iso: "EG",
    });
    assert.match(withIdentity.primary, /\+20/);
    assert.equal(withIdentity.countryIso, "EG");

    const unresolved = formatCustomerPhoneDisplay({
      phone: "01023169075",
      phone_e164: null,
      phone_country_iso: null,
    });
    assert.equal(unresolved.primary, "01023169075");
  });

  it("SA/AE country change yields different E.164", () => {
    const sa = validateCustomerPhoneFormInput({ phone: "0551234567", region: "SA" });
    const ae = validateCustomerPhoneFormInput({ phone: "0551234567", region: "AE" });
    assert.equal(sa.preview.phoneE164, "+966551234567");
    assert.equal(ae.preview.phoneE164, "+971551234567");
  });

  it("E.164 is not reinterpreted by a mismatched region selector", () => {
    const result = validateCustomerPhoneFormInput({
      phone: "+201023169075",
      region: "SA",
    });
    assert.equal(result.code, "ok");
    assert.equal(result.preview.phoneE164, "+201023169075");
    assert.equal(result.preview.phoneCountryIso, "EG");
  });
});
