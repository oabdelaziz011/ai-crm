import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CustomerService } from "./customer-service.js";
import { InMemoryCustomerRepository } from "./customer-repository-port.js";
import type { CustomerPhoneIdentityWrite } from "../types/customer-mutation-input.js";

const sampleCustomer = {
  id: "cust-1",
  companyId: "company-1",
  name: "Omar",
  email: "omar@example.com",
  phone: "+15550001",
  notes: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const egyptIdentity: CustomerPhoneIdentityWrite = {
  phone_e164: "+201023169075",
  phone_country_iso: "EG",
  phone_region_source: "explicit",
  phone_national: "010 23169075",
};

function seedEgyptCustomer(
  repository: InMemoryCustomerRepository,
  overrides: {
    id?: string;
    companyId?: string;
    phone?: string | null;
    phoneIdentity?: CustomerPhoneIdentityWrite;
  } = {},
) {
  repository.seed({
    ...sampleCustomer,
    id: overrides.id ?? "cust-eg",
    companyId: overrides.companyId ?? "company-1",
    name: "نسمة حسام",
    email: null,
    phone: overrides.phone === undefined ? "01023169075" : overrides.phone,
    phoneIdentity: overrides.phoneIdentity ?? egyptIdentity,
  });
}

describe("CustomerService.findCustomer", () => {
  it("returns found when exactly one match exists", async () => {
    const repository = new InMemoryCustomerRepository();
    repository.seed(sampleCustomer);
    const service = new CustomerService(repository);

    const result = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "phone",
      lookupValue: "+15550001",
    });

    assert.equal(result.status, "found");
    assert.equal(result.count, 1);
    if (result.status === "found") {
      assert.equal(result.customer.id, "cust-1");
    }
  });

  it("returns not_found when no match exists", async () => {
    const service = new CustomerService(new InMemoryCustomerRepository());

    const result = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "email",
      lookupValue: "missing@example.com",
    });

    assert.equal(result.status, "not_found");
    assert.equal(result.count, 0);
  });

  it("returns duplicate when multiple matches exist", async () => {
    const repository = new InMemoryCustomerRepository();
    repository.seed(sampleCustomer);
    repository.seed({
      ...sampleCustomer,
      id: "cust-2",
      name: "Duplicate Omar",
    });
    const service = new CustomerService(repository);

    const result = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "phone",
      lookupValue: "+15550001",
    });

    assert.equal(result.status, "duplicate");
    assert.equal(result.count, 2);
  });

  it("finds a nationally stored Egypt mobile when looking up E.164", async () => {
    const repository = new InMemoryCustomerRepository();
    seedEgyptCustomer(repository);
    const service = new CustomerService(repository);

    const result = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "phone",
      lookupValue: "+201023169075",
    });

    assert.equal(result.status, "found");
    if (result.status === "found") {
      assert.equal(result.customer.id, "cust-eg");
    }
  });

  it("finds the same customer from national, Meta digits, and E.164 inputs", async () => {
    const repository = new InMemoryCustomerRepository();
    seedEgyptCustomer(repository);
    const service = new CustomerService(repository);

    for (const lookupValue of ["+201023169075", "01023169075", "201023169075"]) {
      for (const lookupBy of ["phone", "phone_e164"] as const) {
        const result = await service.findCustomer({
          companyId: "company-1",
          userId: "user-1",
          lookupBy,
          lookupValue,
        });
        assert.equal(result.status, "found", `${lookupBy}=${lookupValue}`);
        if (result.status === "found") {
          assert.equal(result.customer.id, "cust-eg");
        }
      }
    }
  });

  it("finds a customer whose phone column is stored as +E.164", async () => {
    const repository = new InMemoryCustomerRepository();
    seedEgyptCustomer(repository, { phone: "+201023169075" });
    const service = new CustomerService(repository);

    const result = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "phone",
      lookupValue: "01023169075",
    });
    assert.equal(result.status, "found");
    if (result.status === "found") {
      assert.equal(result.customer.id, "cust-eg");
    }
  });

  it("falls back to legacy phone when phone_e164 is null", async () => {
    const repository = new InMemoryCustomerRepository();
    seedEgyptCustomer(repository, {
      phoneIdentity: {
        phone_e164: null,
        phone_country_iso: null,
        phone_region_source: "unresolved",
        phone_national: null,
      },
    });
    const service = new CustomerService(repository);

    const byPhone = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "phone",
      lookupValue: "+201023169075",
    });
    assert.equal(byPhone.status, "found");
    if (byPhone.status === "found") {
      assert.equal(byPhone.customer.id, "cust-eg");
    }

    const byE164 = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "phone_e164",
      lookupValue: "+201023169075",
    });
    assert.equal(byE164.status, "found");
    if (byE164.status === "found") {
      assert.equal(byE164.customer.id, "cust-eg");
    }
  });

  it("does not assume Egypt for a non-Egyptian E.164", async () => {
    const repository = new InMemoryCustomerRepository();
    repository.seed({
      ...sampleCustomer,
      id: "cust-us",
      phone: "+14155552671",
      email: null,
      phoneIdentity: {
        phone_e164: "+14155552671",
        phone_country_iso: "US",
        phone_region_source: "e164",
        phone_national: "(415) 555-2671",
      },
    });
    seedEgyptCustomer(repository);
    const service = new CustomerService(repository);

    const us = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "phone",
      lookupValue: "+14155552671",
    });
    assert.equal(us.status, "found");
    if (us.status === "found") {
      assert.equal(us.customer.id, "cust-us");
    }

    const egyptLookup = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "phone",
      lookupValue: "01023169075",
    });
    assert.equal(egyptLookup.status, "found");
    if (egyptLookup.status === "found") {
      assert.equal(egyptLookup.customer.id, "cust-eg");
    }
  });

  it("returns duplicate when distinct customers match across phone and phone_e164", async () => {
    const repository = new InMemoryCustomerRepository();
    seedEgyptCustomer(repository, { id: "cust-a" });
    repository.seed({
      ...sampleCustomer,
      id: "cust-b",
      name: "Other",
      email: null,
      phone: "+201023169075",
      phoneIdentity: {
        phone_e164: null,
        phone_country_iso: null,
        phone_region_source: "unresolved",
        phone_national: null,
      },
    });
    const service = new CustomerService(repository);

    const result = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "phone",
      lookupValue: "+201023169075",
    });
    assert.equal(result.status, "duplicate");
    assert.ok(result.count >= 2);
  });

  it("does not return a customer from another company", async () => {
    const repository = new InMemoryCustomerRepository();
    seedEgyptCustomer(repository, { companyId: "company-2" });
    const service = new CustomerService(repository);

    const result = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "phone",
      lookupValue: "+201023169075",
    });
    assert.equal(result.status, "not_found");
    assert.equal(result.count, 0);
  });

  it("keeps email lookup exact", async () => {
    const repository = new InMemoryCustomerRepository();
    repository.seed(sampleCustomer);
    const service = new CustomerService(repository);

    const found = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "email",
      lookupValue: "omar@example.com",
    });
    assert.equal(found.status, "found");

    const wrongField = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "email",
      lookupValue: "+201023169075",
    });
    assert.equal(wrongField.status, "not_found");
  });

  it("keeps customer_id lookup exact", async () => {
    const repository = new InMemoryCustomerRepository();
    seedEgyptCustomer(repository);
    const service = new CustomerService(repository);

    const found = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "customer_id",
      lookupValue: "cust-eg",
    });
    assert.equal(found.status, "found");
    if (found.status === "found") {
      assert.equal(found.customer.id, "cust-eg");
    }

    const missing = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "customer_id",
      lookupValue: "+201023169075",
    });
    assert.equal(missing.status, "not_found");
  });

  it("does not match on last-9 digit equivalence", async () => {
    const repository = new InMemoryCustomerRepository();
    seedEgyptCustomer(repository);
    const service = new CustomerService(repository);

    const result = await service.findCustomer({
      companyId: "company-1",
      userId: "user-1",
      lookupBy: "phone",
      lookupValue: "023169075",
    });
    assert.equal(result.status, "not_found");
  });
});

describe("CustomerService.resolveCustomerForLeadConversion", () => {
  it("reuses an existing customer by normalized email without inserting", async () => {
    const repository = new InMemoryCustomerRepository();
    repository.seed({
      ...sampleCustomer,
      email: "Jane@Example.com",
    });
    const service = new CustomerService(repository);

    const result = await service.resolveCustomerForLeadConversion({
      companyId: "company-1",
      userId: "user-1",
      name: "Jane Doe",
      email: "jane@example.com",
    });

    assert.equal(result.created, false);
    assert.equal(result.customer.id, "cust-1");
    assert.equal(repository.list().length, 1);
  });

  it("creates a customer when no email match exists", async () => {
    const repository = new InMemoryCustomerRepository();
    const service = new CustomerService(repository);

    const result = await service.resolveCustomerForLeadConversion({
      companyId: "company-1",
      userId: "user-1",
      name: "New Lead",
      email: "new@example.com",
    });

    assert.equal(result.created, true);
    assert.equal(repository.list().length, 1);
    assert.equal(repository.list()[0]?.email, "new@example.com");
  });

  it("maps unexpected duplicate email database errors to a friendly message", async () => {
    const repository = new InMemoryCustomerRepository();
    repository.seed(sampleCustomer);
    const service = new CustomerService(repository);

    await assert.rejects(
      () =>
        service.createCustomer({
          companyId: "company-1",
          userId: "user-1",
          name: "Another Omar",
          email: "omar@example.com",
        }),
      (error: Error) => {
        assert.match(error.message, /already exists/i);
        return true;
      },
    );
    assert.equal(repository.list().length, 1);
  });

  it("rejects ambiguous duplicate email matches", async () => {
    const repository = new InMemoryCustomerRepository();
    repository.seed(sampleCustomer);
    repository.seed({
      ...sampleCustomer,
      id: "cust-2",
      name: "Omar Duplicate",
    });
    const service = new CustomerService(repository);

    await assert.rejects(
      () =>
        service.resolveCustomerForLeadConversion({
          companyId: "company-1",
          userId: "user-1",
          name: "Omar",
          email: "omar@example.com",
        }),
      /Multiple customers share this email/,
    );
  });
});

describe("CustomerService phone_e164 dedup (Phase D3)", () => {
  it("G) rejects create when company already owns phone_e164", async () => {
    const repository = new InMemoryCustomerRepository();
    await repository.createCustomer({
      companyId: "company-a",
      userId: "user-1",
      name: "Existing",
      phone: "01023169075",
      phoneIdentity: {
        phone_e164: "+201023169075",
        phone_country_iso: "EG",
        phone_region_source: "explicit",
        phone_national: "010 2316 9075",
      },
    });
    const service = new CustomerService(repository);

    await assert.rejects(
      () =>
        service.createCustomer({
          companyId: "company-a",
          userId: "user-1",
          name: "Duplicate",
          phone: "+201023169075",
          phoneIdentity: {
            phone_e164: "+201023169075",
            phone_country_iso: "EG",
            phone_region_source: "e164",
            phone_national: "010 2316 9075",
          },
        }),
      /phone number already exists/i,
    );
  });

  it("H) rejects update when another same-company customer owns phone_e164", async () => {
    const repository = new InMemoryCustomerRepository();
    const a = await repository.createCustomer({
      companyId: "company-a",
      userId: "user-1",
      name: "A",
      phone: "01011111111",
      phoneIdentity: {
        phone_e164: "+201011111111",
        phone_country_iso: "EG",
        phone_region_source: "explicit",
        phone_national: "010 1111 1111",
      },
    });
    const b = await repository.createCustomer({
      companyId: "company-a",
      userId: "user-1",
      name: "B",
      phone: "01022222222",
      phoneIdentity: {
        phone_e164: "+201022222222",
        phone_country_iso: "EG",
        phone_region_source: "explicit",
        phone_national: "010 2222 2222",
      },
    });
    const service = new CustomerService(repository);

    await assert.rejects(
      () =>
        service.updateCustomer({
          companyId: "company-a",
          userId: "user-1",
          customerId: b.id,
          field: "phone",
          value: "+201011111111",
          phoneIdentity: {
            phone_e164: "+201011111111",
            phone_country_iso: "EG",
            phone_region_source: "e164",
            phone_national: "010 1111 1111",
          },
        }),
      /phone number already exists/i,
    );
    assert.equal(a.id !== b.id, true);
  });

  it("F) allows same phone_e164 in a different company", async () => {
    const repository = new InMemoryCustomerRepository();
    await repository.createCustomer({
      companyId: "company-a",
      userId: "user-1",
      name: "A",
      phone: "+201023169075",
      phoneIdentity: {
        phone_e164: "+201023169075",
        phone_country_iso: "EG",
        phone_region_source: "e164",
        phone_national: "010 2316 9075",
      },
    });
    const service = new CustomerService(repository);
    const created = await service.createCustomer({
      companyId: "company-b",
      userId: "user-1",
      name: "B",
      phone: "+201023169075",
      phoneIdentity: {
        phone_e164: "+201023169075",
        phone_country_iso: "EG",
        phone_region_source: "e164",
        phone_national: "010 2316 9075",
      },
    });
    assert.equal(created.customer.name, "B");
  });
});
