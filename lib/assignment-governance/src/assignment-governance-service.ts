import {
  ASSIGNMENT_GOVERNANCE_CODES,
  AssignmentGovernanceError,
} from "./errors.js";
import { resolveAssignmentScope } from "./resolve-assignment-scope.js";
import type {
  AssignableEmployee,
  AssignmentActorSnapshot,
  AssignmentDecision,
  AssignmentDepartmentRef,
  AssignmentEmployeeProfile,
  AssignmentGovernanceDataPort,
  AssignmentResource,
  AssignmentScope,
} from "./types.js";

export type AssignmentGovernanceServiceOptions = {
  port: AssignmentGovernanceDataPort;
};

function deny(code: string, message: string): never {
  throw new AssignmentGovernanceError(code, message);
}

export class AssignmentGovernanceService {
  constructor(private readonly options: AssignmentGovernanceServiceOptions) {}

  async loadActorSnapshot(actorUserId: string): Promise<AssignmentActorSnapshot> {
    const profile = await this.options.port.getEmployeeProfile(actorUserId);
    if (!profile) {
      deny(ASSIGNMENT_GOVERNANCE_CODES.ACTOR_NOT_FOUND, "Assignment actor profile not found.");
    }

    const companyId = profile.companyId;
    const roleTemplateKeys =
      companyId != null
        ? await this.options.port.listRoleTemplateKeys(actorUserId, companyId)
        : [];
    const managedDepartmentIds =
      companyId != null
        ? await this.options.port.listManagedDepartmentIds(actorUserId, companyId)
        : [];

    return {
      userId: profile.id,
      companyId,
      isSuperAdmin: profile.isSuperAdmin,
      isActive: profile.isActive,
      departmentId: profile.departmentId,
      roleTemplateKeys,
      managedDepartmentIds,
    };
  }

  async canAssignToEmployee(input: {
    actorUserId: string;
    targetUserId: string;
    resource?: AssignmentResource;
  }): Promise<AssignmentDecision> {
    try {
      const { actor, scope, target } = await this.evaluate(input.actorUserId, input.targetUserId);
      return { allowed: true, reason: null, scope, actor, target };
    } catch (error) {
      if (error instanceof AssignmentGovernanceError) {
        const actor = await this.loadActorSnapshotSafe(input.actorUserId);
        const scope = actor
          ? resolveAssignmentScope(actor)
          : ({ kind: "agent", companyId: "", departmentId: null } as AssignmentScope);
        return {
          allowed: false,
          reason: error.message,
          scope,
          actor: actor ?? {
            userId: input.actorUserId,
            companyId: null,
            isSuperAdmin: false,
            isActive: false,
            departmentId: null,
            roleTemplateKeys: [],
            managedDepartmentIds: [],
          },
          target: null,
        };
      }
      throw error;
    }
  }

  async assertCanAssignToEmployee(input: {
    actorUserId: string;
    targetUserId: string;
    resource?: AssignmentResource;
  }): Promise<void> {
    await this.evaluate(input.actorUserId, input.targetUserId);
  }

  async getAssignableEmployees(input: {
    actorUserId: string;
    resource?: AssignmentResource;
    /** Optional search — applied only within already-authorized candidates. */
    searchQuery?: string;
  }): Promise<AssignableEmployee[]> {
    const actor = await this.loadActorSnapshot(input.actorUserId);
    if (!actor.isActive) {
      deny(ASSIGNMENT_GOVERNANCE_CODES.ACTOR_INACTIVE, "Assignment actor is inactive.");
    }

    const scope = resolveAssignmentScope(actor);

    let rows: AssignableEmployee[] = [];
    if (scope.kind === "super_admin") {
      if (!actor.companyId) return [];
      rows = await this.listEligibleForCompany(actor.companyId, null);
    } else if (scope.kind === "admin") {
      rows = await this.listEligibleForCompany(scope.companyId, null);
    } else if (scope.kind === "manager") {
      if (scope.managedDepartmentIds.length === 0) return [];
      const allowed = new Set(scope.managedDepartmentIds);
      rows = await this.listEligibleForCompany(scope.companyId, allowed);
    } else {
      // agent
      if (!scope.departmentId) return [];
      rows = await this.listEligibleForCompany(scope.companyId, new Set([scope.departmentId]));
    }

    const q = input.searchQuery?.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const name = row.fullName?.toLowerCase() ?? "";
      const email = row.email?.toLowerCase() ?? "";
      const dept = row.departmentName?.toLowerCase() ?? "";
      const branch = row.branchName?.toLowerCase() ?? "";
      const userId = row.userId.toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        dept.includes(q) ||
        branch.includes(q) ||
        userId.includes(q)
      );
    });
  }

  private async loadActorSnapshotSafe(actorUserId: string): Promise<AssignmentActorSnapshot | null> {
    try {
      return await this.loadActorSnapshot(actorUserId);
    } catch {
      return null;
    }
  }

  private async evaluate(
    actorUserId: string,
    targetUserId: string,
  ): Promise<{
    actor: AssignmentActorSnapshot;
    scope: AssignmentScope;
    target: AssignmentEmployeeProfile;
  }> {
    const actor = await this.loadActorSnapshot(actorUserId);
    if (!actor.isActive) {
      deny(ASSIGNMENT_GOVERNANCE_CODES.ACTOR_INACTIVE, "Assignment actor is inactive.");
    }

    const scope = resolveAssignmentScope(actor);
    const target = await this.options.port.getEmployeeProfile(targetUserId);
    if (!target) {
      deny(ASSIGNMENT_GOVERNANCE_CODES.TARGET_NOT_FOUND, "Assignment target profile not found.");
    }
    if (!target.isActive) {
      deny(ASSIGNMENT_GOVERNANCE_CODES.TARGET_INACTIVE, "Assignment target is inactive.");
    }
    if (!target.companyId) {
      deny(ASSIGNMENT_GOVERNANCE_CODES.TARGET_NO_COMPANY, "Assignment target has no company.");
    }
    if (!target.departmentId) {
      deny(
        ASSIGNMENT_GOVERNANCE_CODES.TARGET_NO_DEPARTMENT,
        "Assignment target has no canonical department_id.",
      );
    }

    const department = await this.options.port.getDepartment(target.departmentId);
    if (!department || department.companyId !== target.companyId) {
      deny(
        ASSIGNMENT_GOVERNANCE_CODES.TARGET_DEPARTMENT_INVALID,
        "Assignment target department_id is invalid for the target company.",
      );
    }

    if (scope.kind === "super_admin") {
      // Preserve full Super Admin semantics; still require valid active company target above.
      return { actor, scope, target };
    }

    if (!actor.companyId) {
      deny(ASSIGNMENT_GOVERNANCE_CODES.ACTOR_NO_COMPANY, "Assignment actor has no company.");
    }

    if (target.companyId !== actor.companyId) {
      deny(
        ASSIGNMENT_GOVERNANCE_CODES.TARGET_CROSS_COMPANY,
        "Assignment target belongs to a different company.",
      );
    }

    if (department.companyId !== actor.companyId) {
      deny(
        ASSIGNMENT_GOVERNANCE_CODES.TARGET_DEPARTMENT_INVALID,
        "Assignment target department belongs to a different company.",
      );
    }

    if (scope.kind === "admin") {
      return { actor, scope, target };
    }

    if (scope.kind === "manager") {
      if (scope.managedDepartmentIds.length === 0) {
        deny(
          ASSIGNMENT_GOVERNANCE_CODES.MANAGER_NO_MANAGED_DEPARTMENTS,
          "Manager has no managed departments.",
        );
      }
      if (!scope.managedDepartmentIds.includes(target.departmentId)) {
        deny(
          ASSIGNMENT_GOVERNANCE_CODES.MANAGER_DEPARTMENT_OUT_OF_SCOPE,
          "Target department is outside manager scope.",
        );
      }
      return { actor, scope, target };
    }

    // agent
    if (!scope.departmentId) {
      deny(
        ASSIGNMENT_GOVERNANCE_CODES.AGENT_NO_DEPARTMENT,
        "Agent has no canonical department_id and cannot assign.",
      );
    }
    if (target.departmentId !== scope.departmentId) {
      deny(
        ASSIGNMENT_GOVERNANCE_CODES.AGENT_DEPARTMENT_MISMATCH,
        "Agent may only assign within the same department_id.",
      );
    }

    return { actor, scope, target };
  }

  private async listEligibleForCompany(
    companyId: string,
    departmentFilter: Set<string> | null,
  ): Promise<AssignableEmployee[]> {
    const rows = await this.options.port.listCompanyActiveEmployeesWithDepartment(companyId);
    const out: AssignableEmployee[] = [];
    const deptCache = new Map<string, AssignmentDepartmentRef | null>();
    const branchCache = new Map<string, string | null>();

    for (const row of rows) {
      if (!row.isActive) continue;
      if (!row.departmentId) continue;
      if (departmentFilter && !departmentFilter.has(row.departmentId)) continue;

      let dept = deptCache.get(row.departmentId);
      if (dept === undefined) {
        dept = await this.options.port.getDepartment(row.departmentId);
        deptCache.set(row.departmentId, dept);
      }
      if (!dept || dept.companyId !== companyId) continue;

      let branchName: string | null = null;
      if (dept.branchId) {
        if (!branchCache.has(dept.branchId)) {
          branchCache.set(dept.branchId, await this.options.port.getBranchName(dept.branchId));
        }
        branchName = branchCache.get(dept.branchId) ?? null;
      }

      out.push({
        userId: row.userId,
        companyId,
        departmentId: row.departmentId,
        departmentName: dept.name,
        branchId: dept.branchId,
        branchName,
        fullName: row.fullName,
        email: row.email,
        isActive: true,
      });
    }

    return out;
  }
}

/** Thin port used by ConversationService / TicketCommandService / etc. */
export type AssignmentGovernancePort = {
  assertCanAssignToEmployee(input: {
    actorUserId: string;
    targetUserId: string;
    resource?: AssignmentResource;
  }): Promise<void>;
  getAssignableEmployees(input: {
    actorUserId: string;
    resource?: AssignmentResource;
    searchQuery?: string;
  }): Promise<AssignableEmployee[]>;
};

export function createAssignmentGovernancePort(
  service: AssignmentGovernanceService,
): AssignmentGovernancePort {
  return {
    assertCanAssignToEmployee: (input) => service.assertCanAssignToEmployee(input),
    getAssignableEmployees: (input) => service.getAssignableEmployees(input),
  };
}
