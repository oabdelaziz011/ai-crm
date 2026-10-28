import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCustomerCompanyLabel } from "./enrich-customers";
import type { Customer } from "@/lib/types";

function baseCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "c1",
    user_id: "u1",
    company_id: "tenant-1",
    name: "Sara",
    email: "sara@acmecorp.com",
    phone: null,
    age: null,
    gender: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("resolveCustomerCompanyLabel", () => {
  it("prefers persisted company_name over email-domain heuristic", () => {
    assert.equal(
      resolveCustomerCompanyLabel(
        baseCustomer({ company_name: "Acme Travel", email: "sara@otherdomain.com" }),
      ),
      "Acme Travel",
    );
  });

  it("falls back to email domain when company_name is empty", () => {
    assert.equal(resolveCustomerCompanyLabel(baseCustomer({ company_name: null })), "Acmecorp");
  });

  it("does not confuse tenant company_id with organization name", () => {
    const label = resolveCustomerCompanyLabel(
      baseCustomer({ company_id: "tenant-uuid", company_name: "Client Org", email: null }),
    );
    assert.equal(label, "Client Org");
  });
});
