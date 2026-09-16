import type { AssignmentAuditAction, AssignmentAuditSource } from "./types.js";
import { AssignmentAuditError } from "./errors.js";

const ACTIONS = new Set<AssignmentAuditAction>(["assigned", "reassigned", "unassigned"]);
const SOURCES = new Set<AssignmentAuditSource>(["human", "handoff", "ai", "system"]);

export type AssignmentAuditWriteValidationInput = {
  action: string;
  source: string;
  previousAssigneeUserId: string | null;
  newAssigneeUserId: string | null;
};

/**
 * Enforces action/source enums and old/new/action consistency.
 * Same-assignee is handled upstream (no event); contradictory combos throw.
 */
export function assertValidAssignmentAuditWrite(
  input: AssignmentAuditWriteValidationInput,
): asserts input is {
  action: AssignmentAuditAction;
  source: AssignmentAuditSource;
  previousAssigneeUserId: string | null;
  newAssigneeUserId: string | null;
} {
  if (!ACTIONS.has(input.action as AssignmentAuditAction)) {
    throw new AssignmentAuditError("INVALID_ACTION", `Invalid assignment audit action: ${input.action}`);
  }
  if (!SOURCES.has(input.source as AssignmentAuditSource)) {
    throw new AssignmentAuditError("INVALID_SOURCE", `Invalid assignment audit source: ${input.source}`);
  }

  const previous = input.previousAssigneeUserId;
  const next = input.newAssigneeUserId;

  if (previous === next) {
    throw new AssignmentAuditError(
      "INVALID_ASSIGNEE_COMBINATION",
      "Same previous/new assignee cannot create an assignment audit event.",
    );
  }

  if (input.action === "assigned") {
    if (previous !== null || next === null) {
      throw new AssignmentAuditError(
        "INVALID_ASSIGNEE_COMBINATION",
        "assigned requires previous=null and new!=null.",
      );
    }
  } else if (input.action === "reassigned") {
    if (previous === null || next === null) {
      throw new AssignmentAuditError(
        "INVALID_ASSIGNEE_COMBINATION",
        "reassigned requires previous!=null and new!=null.",
      );
    }
  } else if (input.action === "unassigned") {
    if (previous === null || next !== null) {
      throw new AssignmentAuditError(
        "INVALID_ASSIGNEE_COMBINATION",
        "unassigned requires previous!=null and new=null.",
      );
    }
  }
}

/** Mirrors DB authenticated-caller rule: only human|handoff. */
export function assertClientAllowedAssignmentAuditSource(
  source: AssignmentAuditSource,
  options: { isServiceRole: boolean },
): void {
  if (options.isServiceRole) return;
  if (source !== "human" && source !== "handoff") {
    throw new AssignmentAuditError(
      "SOURCE_NOT_ALLOWED",
      "Authenticated clients may only record human or handoff assignment audit events.",
    );
  }
}
