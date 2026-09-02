import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDuplicateCustomerEmailMessage,
  formatDuplicateCustomerPhoneMessage,
  isDuplicateCustomerEmailError,
  isDuplicateCustomerPhoneE164Error,
  normalizeCustomerEmail,
  toCustomerMutationError,
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

  it("does not map phone_e164 unique errors to email messages", () => {
    const err = new Error(
      'duplicate key value violates unique constraint "idx_customers_company_phone_e164_unique"',
    );
    assert.equal(isDuplicateCustomerEmailError(err), false);
    assert.equal(isDuplicateCustomerPhoneE164Error(err), true);
    assert.match(toCustomerMutationError(err).message, /phone number already exists/i);
    assert.match(formatDuplicateCustomerPhoneMessage(), /phone number already exists/i);
  });

  it("returns a friendly duplicate email message", () => {
    assert.match(formatDuplicateCustomerEmailMessage(), /already exists/i);
  });
});
