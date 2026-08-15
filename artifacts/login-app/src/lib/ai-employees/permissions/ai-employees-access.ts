const AGENTS_VIEW = "agents.view";
const AGENTS_CREATE = "agents.create";
const AGENTS_EDIT = "agents.edit";
const AGENTS_DELETE = "agents.delete";
const AGENTS_MANAGE = "agents.manage";

export function hasAiEmployeesViewPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission(AGENTS_VIEW);
}

export function hasAiEmployeesCreatePermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission(AGENTS_CREATE) || hasPermission(AGENTS_MANAGE);
}

export function hasAiEmployeesEditPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission(AGENTS_EDIT) || hasPermission(AGENTS_MANAGE);
}

export function hasAiEmployeesDeletePermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission(AGENTS_DELETE) || hasPermission(AGENTS_MANAGE);
}

export function isAiEmployeesWorkspaceAccessible(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  agentsFeatureEnabled: boolean | undefined;
  /** Phase 3 commercial entitlement for ai_employee (optional until nav fully wired). */
  companyFeatureEnabled?: boolean;
}): boolean {
  if (input.isSuperAdmin) return true;
  if (input.companyFeatureEnabled === false) return false;
  if (input.agentsFeatureEnabled === false) return false;
  return hasAiEmployeesViewPermission(input.hasPermission, input.isSuperAdmin);
}

export function hasAiEmployeesAdministrationViewPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return (
    isSuperAdmin ||
    hasPermission(AGENTS_MANAGE) ||
    hasAiEmployeesOperationsViewPermission(hasPermission, isSuperAdmin) ||
    hasAiEmployeesGovernanceViewPermission(hasPermission, isSuperAdmin)
  );
}

export function hasAiEmployeesGovernanceViewPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return (
    isSuperAdmin ||
    hasPermission("governance.view") ||
    (hasAiEmployeesViewPermission(hasPermission, isSuperAdmin) && hasPermission("agents.manage"))
  );
}

export function hasAiEmployeesGovernanceEditPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return (
    isSuperAdmin ||
    hasPermission("governance.edit") ||
    hasPermission("governance.manage") ||
    hasPermission("agents.manage")
  );
}

export function hasAiEmployeesCollaborationViewPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return (
    isSuperAdmin ||
    hasPermission("collaboration.view") ||
    (hasAiEmployeesViewPermission(hasPermission, isSuperAdmin) && hasPermission("agents.manage"))
  );
}

export function hasAiEmployeesCollaborationHandoverPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return (
    isSuperAdmin ||
    hasPermission("collaboration.handover") ||
    hasPermission("collaboration.manage") ||
    hasPermission("agents.manage")
  );
}

export function hasAiEmployeesSkillsViewPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return (
    isSuperAdmin ||
    hasPermission("skills.view") ||
    (hasAiEmployeesViewPermission(hasPermission, isSuperAdmin) && hasPermission("agents.manage"))
  );
}

export function hasAiEmployeesSkillsEditPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("skills.edit") || hasPermission("skills.manage");
}

export function hasAiEmployeesMemoryViewPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return hasAiEmployeesOperationsViewPermission(hasPermission, isSuperAdmin);
}

export function hasAiEmployeesOperationsViewPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return (
    isSuperAdmin ||
    (hasAiEmployeesViewPermission(hasPermission, isSuperAdmin) &&
      (hasPermission("ai.analytics.view") || hasPermission("ai.execution.view") || hasPermission(AGENTS_MANAGE)))
  );
}

export function hasAiEmployeesOperationsControlPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return hasAiEmployeesEditPermission(hasPermission, isSuperAdmin);
}

const AGENTS_PUBLISH = "agents.publish";
const AGENTS_ROLLBACK = "agents.rollback";

export function hasAiEmployeesPublishPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission(AGENTS_PUBLISH) || hasPermission(AGENTS_MANAGE);
}

export function hasAiEmployeesRollbackPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission(AGENTS_ROLLBACK) || hasPermission(AGENTS_MANAGE);
}

export function shouldShowAiEmployeesNavigation(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return isAiEmployeesWorkspaceAccessible(input);
}
