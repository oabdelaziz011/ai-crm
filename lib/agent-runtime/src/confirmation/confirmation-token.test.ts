import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONFIRMATION_TOKEN_TTL_MS,
  consumeConfirmationToken,
  createConfirmationToken,
  validateConfirmationToken,
} from "./confirmation-token.js";

describe("confirmation-token", () => {
  const baseRecord = createConfirmationToken({
    workflowId: "wf-1",
    taskId: "task-merge",
    toolKey: "merge_customers",
    userId: "user-1",
    companyId: "company-1",
    now: new Date("2026-07-31T12:00:00.000Z"),
  });

  it("creates short-lived tokens", () => {
    assert.ok(baseRecord.token.length >= 20);
    assert.equal(baseRecord.consumedAt, null);
    const expiresAt = new Date(baseRecord.expiresAt).getTime();
    const issuedAt = new Date(baseRecord.issuedAt).getTime();
    assert.equal(expiresAt - issuedAt, CONFIRMATION_TOKEN_TTL_MS);
  });

  it("validates matching workflow, task, tool, and user", () => {
    const result = validateConfirmationToken(baseRecord, {
      token: baseRecord.token,
      workflowId: "wf-1",
      taskId: "task-merge",
      toolKey: "merge_customers",
      userId: "user-1",
      now: new Date("2026-07-31T12:05:00.000Z"),
    });
    assert.equal(result.valid, true);
  });

  it("rejects expired tokens", () => {
    const result = validateConfirmationToken(baseRecord, {
      token: baseRecord.token,
      workflowId: "wf-1",
      taskId: "task-merge",
      toolKey: "merge_customers",
      userId: "user-1",
      now: new Date("2026-07-31T13:00:00.000Z"),
    });
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.code, "CONFIRMATION_TOKEN_EXPIRED");
    }
  });

  it("rejects reused tokens", () => {
    const consumed = consumeConfirmationToken(baseRecord, new Date("2026-07-31T12:01:00.000Z"));
    const result = validateConfirmationToken(consumed, {
      token: consumed.token,
      workflowId: "wf-1",
      taskId: "task-merge",
      toolKey: "merge_customers",
      userId: "user-1",
      now: new Date("2026-07-31T12:02:00.000Z"),
    });
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.code, "CONFIRMATION_TOKEN_REUSED");
    }
  });

  it("rejects unauthorized confirmation attempts", () => {
    const result = validateConfirmationToken(baseRecord, {
      token: baseRecord.token,
      workflowId: "wf-1",
      taskId: "task-merge",
      toolKey: "merge_customers",
      userId: "user-2",
      now: new Date("2026-07-31T12:05:00.000Z"),
    });
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.code, "CONFIRMATION_UNAUTHORIZED");
    }
  });

  it("allows super-admin to confirm on behalf of workflow owner", () => {
    const result = validateConfirmationToken(baseRecord, {
      token: baseRecord.token,
      workflowId: "wf-1",
      taskId: "task-merge",
      toolKey: "merge_customers",
      userId: "admin-1",
      isSuperAdmin: true,
      now: new Date("2026-07-31T12:05:00.000Z"),
    });
    assert.equal(result.valid, true);
  });
});
