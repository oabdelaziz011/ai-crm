import { AssignmentAuditCompanyScopeError } from "./errors.js";
import { resolveAssignmentAction } from "./resolve-assignment-action.js";
import { assertValidAssignmentAuditWrite } from "./validate-assignment-audit-write.js";
import type {
  AssignmentAuditDataPort,
  AssignmentAuditEvent,
  GetAssignmentHistoryInput,
  RecordAssignmentChangeInput,
} from "./types.js";

function normalizeAssignee(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeCompanyId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new AssignmentAuditCompanyScopeError("companyId is required.");
  return trimmed;
}

function normalizeResourceId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new AssignmentAuditCompanyScopeError("resourceId is required.");
  return trimmed;
}

/**
 * Centralized assignment audit writer. Append-only — never updates or deletes history.
 *
 * Consistency / failure semantics (Phase 5.1):
 * - Callers invoke recordAssignmentChange ONLY after a successful assignment mutation.
 * - PostgREST has no shared transaction across mutation + audit.
 * - If audit persistence fails, the error propagates to the caller (never swallowed).
 * - The assignment may already be committed while the audit write fails — callers must
 *   treat that as an explicit observability failure, not a silent success.
 */
export type AssignmentAuditServiceOptions = {
  port: AssignmentAuditDataPort;
};

export class AssignmentAuditService {
  constructor(private readonly options: AssignmentAuditServiceOptions) {}

  private get port(): AssignmentAuditDataPort {
    return this.options.port;
  }

  async recordAssignmentChange(
    input: RecordAssignmentChangeInput,
  ): Promise<AssignmentAuditEvent | null> {
    const companyId = normalizeCompanyId(input.companyId);
    const resourceId = normalizeResourceId(input.resourceId);
    const previousAssigneeUserId = normalizeAssignee(input.previousAssigneeUserId);
    const newAssigneeUserId = normalizeAssignee(input.newAssigneeUserId);
    const action = resolveAssignmentAction(previousAssigneeUserId, newAssigneeUserId);
    if (!action) return null;

    assertValidAssignmentAuditWrite({
      action,
      source: input.source,
      previousAssigneeUserId,
      newAssigneeUserId,
    });

    await this.port.assertCompanyScope?.(companyId, input.actorUserId);

    return this.port.insertEvent({
      companyId,
      actorUserId: input.actorUserId?.trim() || null,
      resourceType: input.resourceType,
      resourceId,
      previousAssigneeUserId,
      newAssigneeUserId,
      action,
      source: input.source,
      metadata: input.metadata ?? {},
    });
  }

  async getAssignmentHistory(input: GetAssignmentHistoryInput): Promise<AssignmentAuditEvent[]> {
    const companyId = normalizeCompanyId(input.companyId);
    const resourceId = normalizeResourceId(input.resourceId);
    return this.port.listEvents({
      companyId,
      resourceType: input.resourceType,
      resourceId,
      limit: input.limit,
      offset: input.offset,
    });
  }
}

export type AssignmentAuditPort = Pick<
  AssignmentAuditService,
  "recordAssignmentChange" | "getAssignmentHistory"
>;

export function createAssignmentAuditPort(service: AssignmentAuditService): AssignmentAuditPort {
  return {
    recordAssignmentChange: (input) => service.recordAssignmentChange(input),
    getAssignmentHistory: (input) => service.getAssignmentHistory(input),
  };
}
