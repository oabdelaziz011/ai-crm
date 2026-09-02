/**
 * Phase 2H.14 Phase C — dual-write helper + repository identity tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCustomerPhoneIdentityColumns,
  clearedCustomerPhoneIdentityColumns,
  unresolvedCustomerPhoneIdentityColumns,
} from "./customer-phone-identity-dual-write.js";
import { InMemoryCustomerRepository } from "@workspace/automation-platform";

describe("buildCustomerPhoneIdentityColumns", () => {
  it("EG local + region dual-write keeps legacy phone separate", () => {
    const legacy = "01023169075";
    const identity = buildCustomerPhoneIdentityColumns({
      phone: legacy,
      region: "EG",
      source: "explicit",
    });
    assert.equal(identity.phone_e164, "+201023169075");
    assert.equal(identity.phone_country_iso, "EG");
    assert.equal(identity.phone_region_source, "explicit");
    assert.ok(identity.phone_national);
  });

  it("Arabic digits with EG", () => {
    const identity = buildCustomerPhoneIdentityColumns({
      phone: "٠١٠٢٣١٦٩٠٧٥",
      region: "EG",
    });
    assert.equal(identity.phone_e164, "+201023169075");
  });

  it("SA / AE / GB / US / DE / CA", () => {
    assert.equal(
      buildCustomerPhoneIdentityColumns({ phone: "0551234567", region: "SA" }).phone_e164,
      "+966551234567",
    );
    assert.equal(
      buildCustomerPhoneIdentityColumns({ phone: "0501234567", region: "AE" }).phone_e164,
      "+971501234567",
    );
    assert.equal(
      buildCustomerPhoneIdentityColumns({ phone: "07123456789", region: "GB" }).phone_e164,
      "+447123456789",
    );
    assert.equal(
      buildCustomerPhoneIdentityColumns({ phone: "4155552671", region: "US" }).phone_e164,
      "+14155552671",
    );
    assert.equal(
      buildCustomerPhoneIdentityColumns({ phone: "4165551234", region: "CA" }).phone_e164,
      "+14165551234",
    );
    assert.equal(
      buildCustomerPhoneIdentityColumns({ phone: "15123456789", region: "DE" }).phone_e164,
      "+4915123456789",
    );
  });

  it("E.164 without region", () => {
    const identity = buildCustomerPhoneIdentityColumns({ phone: "+966551234567" });
    assert.equal(identity.phone_e164, "+966551234567");
    assert.equal(identity.phone_region_source, "e164");
  });

  it("unresolved local without region does not invent country", () => {
    const identity = buildCustomerPhoneIdentityColumns({ phone: "01023169075" });
    assert.deepEqual(identity, unresolvedCustomerPhoneIdentityColumns());
  });

  it("invalid leaves unresolved identity", () => {
    const identity = buildCustomerPhoneIdentityColumns({ phone: "010123", region: "EG" });
    assert.equal(identity.phone_e164, null);
    assert.equal(identity.phone_region_source, "unresolved");
  });

  it("clear phone clears identity", () => {
    assert.deepEqual(
      buildCustomerPhoneIdentityColumns({ phone: null }),
      clearedCustomerPhoneIdentityColumns(),
    );
  });

  it("import source marks regionSource=import when resolved", () => {
    const identity = buildCustomerPhoneIdentityColumns({
      phone: "01023169075",
      region: "EG",
      source: "import",
    });
    assert.equal(identity.phone_region_source, "import");
  });
});

describe("InMemoryCustomerRepository phone identity dual-write", () => {
  it("create stores identity and preserves legacy phone", async () => {
    const repo = new InMemoryCustomerRepository();
    const identity = buildCustomerPhoneIdentityColumns({
      phone: "01023169075",
      region: "EG",
      source: "explicit",
    });
    const created = await repo.createCustomer({
      companyId: "co-a",
      userId: "u1",
      name: "Nessma",
      phone: "01023169075",
      phoneIdentity: identity,
    });
    assert.equal(created.phone, "01023169075");
    assert.deepEqual(repo.getPhoneIdentity(created.id), identity);
  });

  it("update recomputes identity atomically (no stale e164)", async () => {
    const repo = new InMemoryCustomerRepository();
    const created = await repo.createCustomer({
      companyId: "co-a",
      userId: "u1",
      name: "Nessma",
      phone: "01023169075",
      phoneIdentity: buildCustomerPhoneIdentityColumns({
        phone: "01023169075",
        region: "EG",
      }),
    });
    await repo.updateCustomer({
      companyId: "co-a",
      userId: "u1",
      customerId: created.id,
      field: "phone",
      value: "+966551234567",
      phoneIdentity: buildCustomerPhoneIdentityColumns({ phone: "+966551234567" }),
    });
    const identity = repo.getPhoneIdentity(created.id);
    assert.equal(identity?.phone_e164, "+966551234567");
    assert.equal(identity?.phone_country_iso, "SA");
  });

  it("clear phone clears identity", async () => {
    const repo = new InMemoryCustomerRepository();
    const created = await repo.createCustomer({
      companyId: "co-a",
      userId: "u1",
      name: "Nessma",
      phone: "+201023169075",
      phoneIdentity: buildCustomerPhoneIdentityColumns({ phone: "+201023169075" }),
    });
    await repo.updateCustomer({
      companyId: "co-a",
      userId: "u1",
      customerId: created.id,
      field: "phone",
      value: "",
      phoneIdentity: clearedCustomerPhoneIdentityColumns(),
    });
    assert.deepEqual(repo.getPhoneIdentity(created.id), clearedCustomerPhoneIdentityColumns());
  });

  it("same E.164 across companies is allowed", async () => {
    const repo = new InMemoryCustomerRepository();
    const identity = buildCustomerPhoneIdentityColumns({ phone: "+201023169075" });
    await repo.createCustomer({
      companyId: "co-a",
      userId: "u1",
      name: "A",
      phone: "+201023169075",
      phoneIdentity: identity,
    });
    const b = await repo.createCustomer({
      companyId: "co-b",
      userId: "u2",
      name: "B",
      phone: "+201023169075",
      phoneIdentity: identity,
    });
    assert.ok(b.id);
  });

  it("same E.164 within company is rejected", async () => {
    const repo = new InMemoryCustomerRepository();
    const identity = buildCustomerPhoneIdentityColumns({ phone: "+201023169075" });
    await repo.createCustomer({
      companyId: "co-a",
      userId: "u1",
      name: "A",
      phone: "+201023169075",
      phoneIdentity: identity,
    });
    await assert.rejects(
      () =>
        repo.createCustomer({
          companyId: "co-a",
          userId: "u1",
          name: "Dup",
          phone: "01023169075",
          phoneIdentity: identity,
        }),
      /phone_e164_unique/,
    );
  });

  it("region change recomputes identity for same national digits", async () => {
    const repo = new InMemoryCustomerRepository();
    const phone = "0551234567";
    const created = await repo.createCustomer({
      companyId: "co-a",
      userId: "u1",
      name: "GCC",
      phone,
      phoneIdentity: buildCustomerPhoneIdentityColumns({ phone, region: "SA" }),
    });
    assert.equal(repo.getPhoneIdentity(created.id)?.phone_e164, "+966551234567");
    await repo.updateCustomer({
      companyId: "co-a",
      userId: "u1",
      customerId: created.id,
      field: "phone",
      value: phone,
      phoneIdentity: buildCustomerPhoneIdentityColumns({ phone, region: "AE" }),
    });
    // AE 050… vs SA 055… — same digits 0551234567 under AE may be invalid; use AE-local 050
    await repo.updateCustomer({
      companyId: "co-a",
      userId: "u1",
      customerId: created.id,
      field: "phone",
      value: "0501234567",
      phoneIdentity: buildCustomerPhoneIdentityColumns({ phone: "0501234567", region: "AE" }),
    });
    assert.equal(repo.getPhoneIdentity(created.id)?.phone_e164, "+971501234567");
    assert.equal(repo.getPhoneIdentity(created.id)?.phone_country_iso, "AE");
  });
});
