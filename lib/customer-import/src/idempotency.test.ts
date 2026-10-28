import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCustomerImportRowIdempotencyKey } from "./idempotency.js";

describe("customer import idempotency keys", () => {
  it("stays stable for the same job/row/payload", () => {
    const a = buildCustomerImportRowIdempotencyKey({
      jobId: "job-1",
      contentSha256: "abc",
      rowNumber: 2,
      values: { name: "Sara", email: "sara@example.com" },
    });
    const b = buildCustomerImportRowIdempotencyKey({
      jobId: "job-1",
      contentSha256: "abc",
      rowNumber: 2,
      values: { name: "Sara", email: "sara@example.com" },
    });
    assert.equal(a, b);
  });

  it("differs across jobs so re-uploading the same file is not silently skipped", () => {
    const first = buildCustomerImportRowIdempotencyKey({
      jobId: "job-1",
      contentSha256: "abc",
      rowNumber: 2,
      values: { name: "Sara" },
    });
    const second = buildCustomerImportRowIdempotencyKey({
      jobId: "job-2",
      contentSha256: "abc",
      rowNumber: 2,
      values: { name: "Sara" },
    });
    assert.notEqual(first, second);
  });
});
