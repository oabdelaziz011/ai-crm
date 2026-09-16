import type { AssignmentActorSnapshot, AssignmentScope } from "./types.js";

/**
 * Resolve assignment scope from existing RBAC template keys + manager_user_id.
 * Hierarchy (most privileged first):
 *   super_admin → admin → manager → agent
 */
export function resolveAssignmentScope(actor: AssignmentActorSnapshot): AssignmentScope {
  if (actor.isSuperAdmin) {
    return { kind: "super_admin" };
  }

  if (!actor.companyId) {
    // No company → agent scope with null company handled as deny by callers
    return { kind: "agent", companyId: "", departmentId: actor.departmentId };
  }

  const keys = new Set(actor.roleTemplateKeys.map((k) => k.trim().toLowerCase()).filter(Boolean));

  if (keys.has("admin")) {
    return { kind: "admin", companyId: actor.companyId };
  }

  // Manager template OR department manager via organization_departments.manager_user_id
  if (keys.has("manager") || actor.managedDepartmentIds.length > 0) {
    return {
      kind: "manager",
      companyId: actor.companyId,
      managedDepartmentIds: [...actor.managedDepartmentIds],
    };
  }

  return {
    kind: "agent",
    companyId: actor.companyId,
    departmentId: actor.departmentId,
  };
}
