import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDuplicateCustomerEmailMessage,
  isDuplicateCustomerEmailError,
  normalizeCustomerEmail,
} from "./customer-email-utils.js";

describe("customer-email-utils", () => {
  it("normalizes email for lookup and storage", () => {
    assert.equal(normalizeCustomerEmail("  Jane@Example.COM "), "jane@example.com");
    assert.equal(normalizeCustomerEmail(""), null);
  });

  it("detects duplicate customer email constraint errors", () => {
    assert.equal(
      isDuplicateCustomerEmailError(
        new Error('duplicate key value violates unique constraint "idx_customer_user_email"'),
      ),
      true,
    );
    assert.equal(
      isDuplicateCustomerEmailError(
        new Error('duplicate key value violates unique constraint "idx_customers_company_email_unique"'),
      ),
      true,
    );
    assert.equal(isDuplicateCustomerEmailError(new Error("permission denied")), false);
  });

  it("returns a friendly duplicate email message", () => {
    assert.match(formatDuplicateCustomerEmailMessage(), /already exists/i);
  });
});
