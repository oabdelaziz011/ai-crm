import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickDepartmentQueueAssignee } from "./pick-department-queue-assignee.js";

describe("pickDepartmentQueueAssignee", () => {
  it("returns null for an empty pool", () => {
    assert.equal(pickDepartmentQueueAssignee([]), null);
  });

  it("prefers the least-busy active member", () => {
    assert.equal(
      pickDepartmentQueueAssignee([
        { userId: "a", activeConversationCount: 4 },
        { userId: "b", activeConversationCount: 1 },
        { userId: "c", activeConversationCount: 2 },
      ]),
      "b",
    );
  });

  it("breaks ties with older lastAssignedAt then stable userId", () => {
    assert.equal(
      pickDepartmentQueueAssignee([
        { userId: "z", activeConversationCount: 0, lastAssignedAt: "2026-02-01T00:00:00.000Z" },
        { userId: "a", activeConversationCount: 0, lastAssignedAt: "2026-01-01T00:00:00.000Z" },
      ]),
      "a",
    );
  });
});
