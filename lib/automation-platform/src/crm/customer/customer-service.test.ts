import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CustomerService } from "./customer-service.js";
import { InMemoryCustomerRepository } from "./customer-repository-port.js";

const sampleCustomer = {
  id: "cust-1",
  name: "Omar",
  email: "omar@example.com",
  phone: "+15550001",
  notes: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

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
});
