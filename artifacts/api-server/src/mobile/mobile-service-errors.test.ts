import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapMobileServiceError } from "./mobile-service-errors.js";

function domainError(name: string, code: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return Object.assign(error, { code });
}

describe("mobile service errors", () => {
  it("maps a missing department to a business denial", () => {
    const mapped = mapMobileServiceError(domainError(
      "ConversationDomainError",
      "PERMISSION_DENIED",
      "Missing required permission: ai.conversations.takeover (assignment_target_no_department: Assignment target has no canonical department_id.)",
    ));
    assert.equal(mapped?.statusCode, 403);
    assert.equal(mapped?.code, "assignment_rejected");
    assert.equal(mapped?.message.includes("department"), false);
  });

  it("maps an unknown assignee to the same business denial", () => {
    const governance = mapMobileServiceError(domainError(
      "TicketPermissionDeniedError",
      "TICKET_PERMISSION_DENIED",
      "Permission denied: tickets.assign (assignment_target_not_found: Assignment target was not found.)",
    ));
    const missing = mapMobileServiceError(domainError(
      "TicketAssigneeNotFoundError",
      "TICKET_ASSIGNEE_NOT_FOUND",
      "No agent found matching the id.",
    ));
    assert.equal(governance?.statusCode, 403);
    assert.equal(governance?.code, "assignment_rejected");
    assert.equal(missing?.statusCode, 403);
    assert.equal(missing?.code, "assignment_rejected");
  });

  it("keeps a missing permission distinct from an assignment rule", () => {
    const mapped = mapMobileServiceError(domainError(
      "TicketPermissionDeniedError",
      "TICKET_PERMISSION_DENIED",
      "Permission denied: tickets.assign",
    ));
    assert.equal(mapped?.statusCode, 403);
    assert.equal(mapped?.code, "forbidden");
  });

  it("maps a missing record to not found and leaves unexpected errors unmapped", () => {
    const missing = mapMobileServiceError(domainError("ConversationDomainError", "CONVERSATION_NOT_FOUND", "Conversation missing."));
    assert.equal(missing?.statusCode, 404);
    assert.equal(mapMobileServiceError(new Error("database socket closed")), null);
  });
});
