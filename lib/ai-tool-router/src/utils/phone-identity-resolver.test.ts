/**
 * Phase 2H.13 Phase B — Global phone identity resolver tests.
 * Pure / local — no DB, Meta, Supabase, or provider calls.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  companyPhoneIdentitiesEqual,
  createCompanyPhoneIdentityLookup,
  formatPhoneIdentityInternational,
  phoneIdentityUsesLastNine,
  resolvePhoneIdentity,
  sanitizePhoneIdentityInput,
} from "./phone-identity-resolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function assertResolved(
  phone: string,
  region: string | undefined,
  expectedE164: string,
  opts?: { source?: "explicit" | "channel" | "import"; regionSource?: string },
) {
  const result = resolvePhoneIdentity({
    phone,
    region,
    source: opts?.source,
  });
  assert.equal(result.status, "resolved", `${phone} / ${region}: ${JSON.stringify(result)}`);
  if (result.status === "resolved") {
    assert.equal(result.phoneE164, expectedE164);
    if (opts?.regionSource) assert.equal(result.regionSource, opts.regionSource);
  }
  return result;
}

describe("resolvePhoneIdentity — Egypt", () => {
  it("resolves 010 / 011 / 012 / 015 with EG", () => {
    assertResolved("01023169075", "EG", "+201023169075", { regionSource: "explicit" });
    assertResolved("01123456789", "EG", "+201123456789");
    assertResolved("01223456789", "EG", "+201223456789");
    assertResolved("01523456789", "EG", "+201523456789");
  });

  it("resolves country-coded and E.164 Egypt forms", () => {
    assertResolved("201023169075", "EG", "+201023169075");
    assertResolved("+201023169075", undefined, "+201023169075", { regionSource: "e164" });
    assertResolved("201023169075", undefined, "+201023169075", { regionSource: "e164" });
  });

  it("handles Arabic digits and formatting", () => {
    assertResolved("٠١٠٢٣١٦٩٠٧٥", "EG", "+201023169075");
    assertResolved("010-231-69075", "EG", "+201023169075");
    assertResolved("(010) 231 69075", "EG", "+201023169075");
  });
});

describe("resolvePhoneIdentity — GCC", () => {
  it("Saudi Arabia", () => {
    assertResolved("0551234567", "SA", "+966551234567");
    assertResolved("966551234567", undefined, "+966551234567");
    assertResolved("+966551234567", undefined, "+966551234567", { regionSource: "e164" });
  });

  it("UAE", () => {
    assertResolved("0501234567", "AE", "+971501234567");
    assertResolved("971501234567", undefined, "+971501234567");
    assertResolved("+971501234567", undefined, "+971501234567");
  });

  it("Qatar", () => {
    assertResolved("33123456", "QA", "+97433123456");
    assertResolved("97433123456", undefined, "+97433123456");
    assertResolved("+97433123456", undefined, "+97433123456");
  });

  it("Kuwait", () => {
    assertResolved("50012345", "KW", "+96550012345");
    assertResolved("96550012345", undefined, "+96550012345");
    assertResolved("+96550012345", undefined, "+96550012345");
  });

  it("Bahrain", () => {
    assertResolved("36123456", "BH", "+97336123456");
    assertResolved("97336123456", undefined, "+97336123456");
    assertResolved("+97336123456", undefined, "+97336123456");
  });

  it("Oman", () => {
    assertResolved("91234567", "OM", "+96891234567");
    assertResolved("96891234567", undefined, "+96891234567");
    assertResolved("+96891234567", undefined, "+96891234567");
  });
});

describe("resolvePhoneIdentity — Europe / North America", () => {
  it("UK", () => {
    assertResolved("07123456789", "GB", "+447123456789");
    assertResolved("447123456789", undefined, "+447123456789");
    assertResolved("+447123456789", undefined, "+447123456789");
  });

  it("USA", () => {
    assertResolved("4155552671", "US", "+14155552671");
    assertResolved("14155552671", undefined, "+14155552671");
    assertResolved("+14155552671", undefined, "+14155552671");
  });

  it("Canada", () => {
    assertResolved("4165551234", "CA", "+14165551234");
    assertResolved("+14165551234", undefined, "+14165551234");
  });

  it("Germany", () => {
    assertResolved("15123456789", "DE", "+4915123456789");
    assertResolved("4915123456789", undefined, "+4915123456789");
    assertResolved("+4915123456789", undefined, "+4915123456789");
  });
});

describe("resolvePhoneIdentity — channel source", () => {
  it("maps Meta-style digits to E.164 with regionSource=channel", () => {
    const result = assertResolved("201023169075", undefined, "+201023169075", {
      source: "channel",
      regionSource: "channel",
    });
    assert.equal(result.status, "resolved");
  });

  it("does not invent EG for local channel digits without region", () => {
    const result = resolvePhoneIdentity({ phone: "01023169075", source: "channel" });
    assert.equal(result.status, "unresolved");
    if (result.status !== "resolved") assert.equal(result.reason, "missing_region");
  });
});

describe("resolvePhoneIdentity — fail closed", () => {
  it("requires region for local numbers", () => {
    const result = resolvePhoneIdentity({ phone: "01023169075" });
    assert.equal(result.status, "unresolved");
    if (result.status !== "resolved") assert.equal(result.reason, "missing_region");
  });

  it("normalizes international dialing prefix 00 without country guessing", () => {
    assertResolved("00201023169075", undefined, "+201023169075", { regionSource: "e164" });
    assertResolved("00966551234567", undefined, "+966551234567", { regionSource: "e164" });
  });

  it("rejects invalid numbers", () => {
    const result = resolvePhoneIdentity({ phone: "010123", region: "EG" });
    assert.notEqual(result.status, "resolved");
  });

  it("rejects malformed +", () => {
    const result = resolvePhoneIdentity({ phone: "20+1023169075" });
    assert.equal(result.status, "invalid");
    if (result.status !== "resolved") assert.equal(result.reason, "malformed_plus");
  });

  it("rejects too short / too long", () => {
    assert.equal(sanitizePhoneIdentityInput("12").ok, false);
    const long = `+${"1".repeat(20)}`;
    const tooLong = sanitizePhoneIdentityInput(long);
    assert.equal(tooLong.ok, false);
    if (!tooLong.ok) assert.equal(tooLong.reason, "too_long");
  });

  it("rejects extensions (fail closed)", () => {
    const cases = [
      "+14155552671 ext 99",
      "+14155552671x99",
      "+14155552671#99",
      "4155552671;ext=99",
    ];
    for (const phone of cases) {
      const result = resolvePhoneIdentity({ phone, region: "US" });
      assert.notEqual(result.status, "resolved", phone);
      if (result.status !== "resolved") {
        assert.equal(result.reason, "extension_not_supported", phone);
      }
    }
  });

  it("rejects invalid region codes", () => {
    const result = resolvePhoneIdentity({ phone: "01023169075", region: "egy" });
    assert.equal(result.status, "invalid");
    if (result.status !== "resolved") assert.equal(result.reason, "invalid_region");
  });

  it("never uses company country as region fallback", () => {
    const result = resolvePhoneIdentity({
      phone: "01023169075",
      companyCountry: "EG",
    } as never);
    assert.equal(result.status, "unresolved");
    if (result.status !== "resolved") {
      assert.equal(result.reason, "company_country_forbidden");
    }
  });

  it("never uses browser locale as region fallback", () => {
    const result = resolvePhoneIdentity({
      phone: "01023169075",
      browserLocale: "ar-EG",
    } as never);
    assert.equal(result.status, "unresolved");
    if (result.status !== "resolved") {
      assert.equal(result.reason, "browser_locale_forbidden");
    }
  });
});

describe("resolvePhoneIdentity — number type", () => {
  it("exposes MOBILE for Egypt mobile", () => {
    const result = resolvePhoneIdentity({ phone: "01023169075", region: "EG" });
    assert.equal(result.status, "resolved");
    if (result.status === "resolved") {
      assert.equal(result.numberType, "MOBILE");
    }
  });

  it("exposes FIXED_LINE when library identifies it", () => {
    // London geographic landline example
    const result = resolvePhoneIdentity({ phone: "02079460123", region: "GB" });
    assert.equal(result.status, "resolved");
    if (result.status === "resolved") {
      assert.ok(
        result.numberType === "FIXED_LINE" || result.numberType === "UNKNOWN",
        result.numberType,
      );
    }
  });

  it("exposes a type label for US numbers", () => {
    const result = resolvePhoneIdentity({ phone: "+14155552671" });
    assert.equal(result.status, "resolved");
    if (result.status === "resolved") {
      assert.ok(["MOBILE", "FIXED_LINE", "VOIP", "UNKNOWN"].includes(result.numberType));
    }
  });
});

describe("resolvePhoneIdentity — last-9 is not identity", () => {
  it("documents that last-9 is not used", () => {
    assert.equal(phoneIdentityUsesLastNine(), false);
  });

  it("does not treat shared last-9 as equal identity", () => {
    const a = resolvePhoneIdentity({ phone: "+201023169075" });
    const b = resolvePhoneIdentity({ phone: "+966551234567" });
    assert.equal(a.status, "resolved");
    assert.equal(b.status, "resolved");
    if (a.status === "resolved" && b.status === "resolved") {
      // Identity is full E.164, never suffix equality
      assert.notEqual(a.phoneE164, b.phoneE164);
      assert.equal(phoneIdentityUsesLastNine(), false);
    }
  });

  it("resolver source never implements trailing-digit suffix identity", () => {
    const src = readFileSync(join(__dirname, "phone-identity-resolver.ts"), "utf8");
    assert.doesNotMatch(src, /slice\s*\(\s*-9\s*\)/);
    assert.match(src, /phoneIdentityUsesLastNine/);
    assert.match(src, /Does NOT use trailing-digit suffix matching/);
  });
});

describe("company-scoped phone identity lookup", () => {
  it("requires companyId + phoneE164", () => {
    assert.equal(
      createCompanyPhoneIdentityLookup({ companyId: null, phoneE164: "+201023169075" }).ok,
      false,
    );
    assert.equal(
      createCompanyPhoneIdentityLookup({ companyId: "co-a", phoneE164: null }).ok,
      false,
    );
  });

  it("Company A and Company B with same E.164 are distinct", () => {
    const a = createCompanyPhoneIdentityLookup({
      companyId: "company-a",
      phoneE164: "+201023169075",
    });
    const b = createCompanyPhoneIdentityLookup({
      companyId: "company-b",
      phoneE164: "+201023169075",
    });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (a.ok && b.ok) {
      assert.equal(companyPhoneIdentitiesEqual(a.lookup, b.lookup), false);
      assert.equal(companyPhoneIdentitiesEqual(a.lookup, a.lookup), true);
    }
  });
});

describe("resolvePhoneIdentity — import / explicit region sources", () => {
  it("marks import when source=import and region provided", () => {
    assertResolved("01023169075", "EG", "+201023169075", {
      source: "import",
      regionSource: "import",
    });
  });

  it("marks explicit when region provided without import source", () => {
    assertResolved("01023169075", "EG", "+201023169075", {
      source: "explicit",
      regionSource: "explicit",
    });
  });
});

describe("resolvePhoneIdentity — preview/send shared contract", () => {
  it("same input yields identical E.164 for preview and send consumers", () => {
    const input = { phone: "010-231-69075", region: "EG" as const, source: "explicit" as const };
    const preview = resolvePhoneIdentity(input);
    const send = resolvePhoneIdentity(input);
    assert.deepEqual(preview, send);
    assert.equal(preview.status, "resolved");
    if (preview.status === "resolved") assert.equal(preview.phoneE164, "+201023169075");
  });

  it("formatPhoneIdentityInternational spaces E.164 for UI", () => {
    const formatted = formatPhoneIdentityInternational("+201023169075");
    assert.ok(formatted);
    assert.match(formatted!, /\+20/);
    assert.ok(formatted!.includes(" "));
  });
});
