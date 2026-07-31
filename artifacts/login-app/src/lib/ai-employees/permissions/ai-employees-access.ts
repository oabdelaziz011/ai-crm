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
}): boolean {
  if (input.isSuperAdmin) return true;
  if (input.agentsFeatureEnabled === false) return false;
  return hasAiEmployeesViewPermission(input.hasPermission, input.isSuperAdmin);
}

export function shouldShowAiEmployeesNavigation(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  agentsFeatureEnabled: boolean | undefined;
}): boolean {
  return isAiEmployeesWorkspaceAccessible(input);
}
