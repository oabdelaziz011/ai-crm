/**
 * D5.4 Gap 2 — repository write boundary: omitted phoneIdentity cannot silently
 * persist unsafe local identity. Uses InMemoryCustomerRepository (no DB).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryCustomerRepository } from "./customer-repository-port.js";
import {
  CustomerPhoneIdentityWriteError,
  resolvePhoneIdentityWrite,
} from "./customer-phone-identity-write.js";

describe("D5.4 Gap 2 resolvePhoneIdentityWrite", () => {
  it("empty phone clears identity", () => {
    const identity = resolvePhoneIdentityWrite(null);
    assert.equal(identity.phone_e164, null);
    assert.equal(identity.phone_region_source, null);
  });

  it("E.164 without region resolves", () => {
    const identity = resolvePhoneIdentityWrite("+201023169075");
    assert.equal(identity.phone_e164, "+201023169075");
    assert.equal(identity.phone_country_iso, "EG");
  });

  it("local without region fail closed", () => {
    assert.throws(
      () => resolvePhoneIdentityWrite("01023169075"),
      (err: unknown) =>
        err instanceof CustomerPhoneIdentityWriteError &&
        err.code === "phone_region_required",
    );
  });

  it("local + explicit region via options resolves", () => {
    const identity = resolvePhoneIdentityWrite("01023169075", null, { region: "EG" });
    assert.equal(identity.phone_e164, "+201023169075");
  });

  it("provided identity is validated and persisted", () => {
    const identity = resolvePhoneIdentityWrite("01023169075", {
      phone_e164: "+966551234567",
      phone_country_iso: "SA",
      phone_region_source: "explicit",
      phone_national: "055 123 4567",
    });
    assert.equal(identity.phone_e164, "+966551234567");
  });

  it("invalid provided e164 rejected", () => {
    assert.throws(
      () =>
        resolvePhoneIdentityWrite("x", {
          phone_e164: "not-e164",
          phone_country_iso: null,
          phone_region_source: null,
          phone_national: null,
        }),
      (err: unknown) =>
        err instanceof CustomerPhoneIdentityWriteError &&
        err.code === "invalid_phone_identity",
    );
  });
});

describe("D5.4 Gap 2 InMemoryCustomerRepository create", () => {
  it("omitted phoneIdentity cannot create with local phone", async () => {
    const repo = new InMemoryCustomerRepository();
    await assert.rejects(
      () =>
        repo.createCustomer({
          companyId: "co-a",
          userId: "u1",
          name: "Local",
          phone: "01023169075",
        }),
      /PHONE_REGION_REQUIRED|phone_region_required/i,
    );
  });

  it("create with E.164 succeeds without explicit phoneIdentity", async () => {
    const repo = new InMemoryCustomerRepository();
    const row = await repo.createCustomer({
      companyId: "co-a",
      userId: "u1",
      name: "Intl",
      phone: "+201023169075",
    });
    assert.equal(row.phone, "+201023169075");
    assert.equal(repo.getPhoneIdentity(row.id)?.phone_e164, "+201023169075");
  });
});
