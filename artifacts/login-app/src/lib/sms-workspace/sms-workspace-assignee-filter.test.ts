import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SMS_WORKSPACE_ASSIGNEE_ALL,
  SMS_WORKSPACE_ASSIGNEE_UNASSIGNED,
  assigneeFilterToListAssignedUserId,
  parseSmsWorkspaceAssigneeFilter,
  writeSmsAssigneeToSearchParams,
} from "./sms-workspace-assignee-filter.ts";

describe("sms workspace assignee filter", () => {
  it("maps All / Unassigned / user id for server list filters", () => {
    assert.equal(assigneeFilterToListAssignedUserId(SMS_WORKSPACE_ASSIGNEE_ALL), undefined);
    assert.equal(assigneeFilterToListAssignedUserId(SMS_WORKSPACE_ASSIGNEE_UNASSIGNED), null);
    assert.equal(
      assigneeFilterToListAssignedUserId("11111111-1111-4111-8111-111111111111"),
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("rejects non-uuid assignee values", () => {
    assert.equal(parseSmsWorkspaceAssigneeFilter("not-a-uuid"), SMS_WORKSPACE_ASSIGNEE_ALL);
  });

  it("writes assignee into search params without dropping other keys", () => {
    const params = new URLSearchParams("conversation=c1");
    const next = writeSmsAssigneeToSearchParams(params, "unassigned");
    assert.equal(next.get("conversation"), "c1");
    assert.equal(next.get("assignee"), "unassigned");
  });
});
