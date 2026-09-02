/**
 * D5.3 — Import phone identity resolution (pure / local).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  previewImportCustomerPhoneRows,
  resolveImportPhoneIdentity,
  resolveImportPhoneRegion,
} from "./import-phone-identity.js";

describe("resolveImportPhoneRegion precedence", () => {
  it("row region wins over default", () => {
    assert.equal(
      resolveImportPhoneRegion({ rowRegion: "SA", defaultRegion: "EG" }),
      "SA",
    );
  });

  it("falls back to default region", () => {
    assert.equal(resolveImportPhoneRegion({ rowRegion: null, defaultRegion: "AE" }), "AE");
  });

  it("never invents a region", () => {
    assert.equal(resolveImportPhoneRegion({}), null);
  });
});

describe("resolveImportPhoneIdentity — international", () => {
  const cases: Array<{ phone: string; e164: string; iso: string }> = [
    { phone: "+201023169075", e164: "+201023169075", iso: "EG" },
    { phone: "201023169075", e164: "+201023169075", iso: "EG" },
    { phone: "+966551234567", e164: "+966551234567", iso: "SA" },
    { phone: "+971501234567", e164: "+971501234567", iso: "AE" },
    { phone: "+97433123456", e164: "+97433123456", iso: "QA" },
    { phone: "+96550012345", e164: "+96550012345", iso: "KW" },
    { phone: "+97336123456", e164: "+97336123456", iso: "BH" },
    { phone: "+96891234567", e164: "+96891234567", iso: "OM" },
    { phone: "+447123456789", e164: "+447123456789", iso: "GB" },
    { phone: "+4915123456789", e164: "+4915123456789", iso: "DE" },
    { phone: "+33612345678", e164: "+33612345678", iso: "FR" },
    { phone: "+393312345678", e164: "+393312345678", iso: "IT" },
    { phone: "+34612345678", e164: "+34612345678", iso: "ES" },
    { phone: "+14155552671", e164: "+14155552671", iso: "US" },
    { phone: "+14165551234", e164: "+14165551234", iso: "CA" },
    { phone: "+919876543210", e164: "+919876543210", iso: "IN" },
    { phone: "00201023169075", e164: "+201023169075", iso: "EG" },
  ];

  for (const c of cases) {
    it(`resolves ${c.phone}`, () => {
      const result = resolveImportPhoneIdentity({ phone: c.phone, source: "import" });
      assert.equal(result.code, "ok", JSON.stringify(result));
      assert.equal(result.phoneE164, c.e164);
      assert.equal(result.phoneCountryIso, c.iso);
      assert.ok(result.phoneRegionSource === "e164" || result.phoneRegionSource === "import");
    });
  }
});

describe("resolveImportPhoneIdentity — local + region", () => {
  it("EG/SA/AE/GB/US locals", () => {
    assert.equal(
      resolveImportPhoneIdentity({ phone: "01023169075", rowRegion: "EG" }).phoneE164,
      "+201023169075",
    );
    assert.equal(
      resolveImportPhoneIdentity({ phone: "0551234567", rowRegion: "SA" }).phoneE164,
      "+966551234567",
    );
    assert.equal(
      resolveImportPhoneIdentity({ phone: "0501234567", rowRegion: "AE" }).phoneE164,
      "+971501234567",
    );
    assert.equal(
      resolveImportPhoneIdentity({ phone: "07123456789", rowRegion: "GB" }).phoneE164,
      "+447123456789",
    );
    assert.equal(
      resolveImportPhoneIdentity({ phone: "4155552671", rowRegion: "US" }).phoneE164,
      "+14155552671",
    );
  });

  it("uses import defaultRegion when row region absent", () => {
    const result = resolveImportPhoneIdentity({
      phone: "01023169075",
      defaultRegion: "EG",
      source: "import",
    });
    assert.equal(result.code, "ok");
    assert.equal(result.phoneE164, "+201023169075");
    assert.equal(result.phoneRegionSource, "import");
  });

  it("Arabic digits + EG", () => {
    const result = resolveImportPhoneIdentity({
      phone: "٠١٠٢٣١٦٩٠٧٥",
      rowRegion: "EG",
    });
    assert.equal(result.phoneE164, "+201023169075");
  });

  it("local without region fail closed", () => {
    const result = resolveImportPhoneIdentity({ phone: "01023169075" });
    assert.equal(result.code, "phone_region_required");
    assert.equal(result.identity, null);
  });

  it("invalid fail closed", () => {
    const result = resolveImportPhoneIdentity({ phone: "123", rowRegion: "EG" });
    assert.equal(result.code, "invalid_phone");
  });
});

describe("previewImportCustomerPhoneRows dry-run", () => {
  it("exposes resolved identity without secrets and no DB writes", () => {
    const preview = previewImportCustomerPhoneRows({
      defaultRegion: "EG",
      rows: [
        { name: "A", phone: "+966551234567" },
        { name: "B", phone: "01023169075" },
        { name: "D", phone: "01023169075", region: "EG" },
        { name: "", phone: "+201023169075" },
      ],
    });
    assert.equal(preview[0]!.phoneStatus, "resolved");
    assert.equal(preview[0]!.phoneE164, "+966551234567");
    assert.equal(preview[1]!.writable, true); // defaultRegion EG
    assert.equal(preview[2]!.writable, true);
    assert.equal(preview[3]!.writable, false); // empty name

    const needsRegion = previewImportCustomerPhoneRows({
      rows: [{ name: "Local", phone: "01023169075" }],
    });
    assert.equal(needsRegion[0]!.phoneCode, "phone_region_required");
    assert.equal(needsRegion[0]!.writable, false);
  });
});
