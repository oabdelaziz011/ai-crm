import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  companyScopedPhoneE164Lookup,
  planCustomerPhoneSearch,
  queryLooksLikePhoneSearch,
} from "./customer-phone-search.js";
import { resolvePhoneIdentity } from "./phone-identity-resolver.js";

describe("Phase D3 — customer phone search planning", () => {
  const INTERNATIONAL: Array<{ label: string; input: string; e164: string }> = [
    { label: "EG", input: "201023169075", e164: "+201023169075" },
    { label: "EG+", input: "+201023169075", e164: "+201023169075" },
    { label: "SA", input: "966551234567", e164: "+966551234567" },
    { label: "AE", input: "971501234567", e164: "+971501234567" },
    { label: "QA", input: "97433123456", e164: "+97433123456" },
    { label: "KW", input: "96551234567", e164: "+96551234567" },
    { label: "BH", input: "97336123456", e164: "+97336123456" },
    { label: "OM", input: "96891234567", e164: "+96891234567" },
    { label: "GB", input: "447911123456", e164: "+447911123456" },
    { label: "US", input: "14155552671", e164: "+14155552671" },
    { label: "CA", input: "14165550123", e164: "+14165550123" },
    { label: "DE", input: "4915123456789", e164: "+4915123456789" },
    { label: "FR", input: "33612345678", e164: "+33612345678" },
    { label: "IT", input: "393312345678", e164: "+393312345678" },
    { label: "ES", input: "34612345678", e164: "+34612345678" },
    { label: "IN", input: "919876543210", e164: "+919876543210" },
  ];

  it("A/C/D) E.164 and Meta digits plan to the same company-scoped identity", () => {
    for (const row of INTERNATIONAL) {
      const plan = planCustomerPhoneSearch({ query: row.input, source: "explicit" });
      assert.equal(plan.strategy, "phone_e164", row.label);
      assert.equal(plan.phoneE164, row.e164, row.label);
      const scoped = companyScopedPhoneE164Lookup({
        companyId: "company-a",
        phoneE164: plan.phoneE164,
      });
      assert.ok(scoped);
      assert.equal(scoped!.companyId, "company-a");
      assert.equal(scoped!.phoneE164, row.e164);
    }
  });

  it("B) local EG with Egypt-validated national form resolves via explicit EG bridge", () => {
    const plan = planCustomerPhoneSearch({ query: "01023169075", source: "explicit" });
    assert.equal(plan.strategy, "phone_e164");
    assert.equal(plan.phoneE164, "+201023169075");
  });

  it("E) Arabic digits resolve consistently with ASCII EG local", () => {
    const arabic = planCustomerPhoneSearch({ query: "٠١٠٢٣١٦٩٠٧٥", source: "explicit" });
    const ascii = planCustomerPhoneSearch({ query: "01023169075", source: "explicit" });
    assert.equal(arabic.phoneE164, ascii.phoneE164);
    assert.equal(arabic.phoneE164, "+201023169075");
  });

  it("F) company-scoped lookup never accepts e164 alone", () => {
    assert.equal(
      companyScopedPhoneE164Lookup({ companyId: "", phoneE164: "+201023169075" }),
      null,
    );
    assert.equal(
      companyScopedPhoneE164Lookup({ companyId: "company-a", phoneE164: "201023169075" }),
      null,
    );
  });

  it("I) invalid number fails safely to legacy_fallback", () => {
    const plan = planCustomerPhoneSearch({ query: "not-a-phone", source: "explicit" });
    assert.equal(plan.strategy, "legacy_fallback");
    assert.equal(plan.phoneE164, null);
  });

  it("J/K) unresolved short local digits do not manufacture E.164", () => {
    const plan = planCustomerPhoneSearch({ query: "5551234", source: "explicit" });
    assert.equal(plan.strategy, "legacy_fallback");
    assert.equal(plan.phoneE164, null);
    assert.equal(queryLooksLikePhoneSearch("Ahmed"), false);
    assert.equal(queryLooksLikePhoneSearch("01023169075"), true);
  });

  it("name queries are not treated as phone searches", () => {
    assert.equal(queryLooksLikePhoneSearch("سارة"), false);
    const plan = planCustomerPhoneSearch({ query: "سارة", source: "explicit" });
    assert.equal(plan.strategy, "legacy_fallback");
  });

  it("Q/R) planning is pure — does not mutate phone strings", () => {
    const original = "01023169075";
    planCustomerPhoneSearch({ query: original, source: "explicit" });
    assert.equal(original, "01023169075");
    const resolved = resolvePhoneIdentity({ phone: "+201023169075" });
    assert.equal(resolved.status, "resolved");
  });
});
