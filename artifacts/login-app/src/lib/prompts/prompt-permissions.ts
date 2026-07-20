export function canViewPrompts(hasPermission: (code: string) => boolean, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || hasPermission("prompts.view");
}

export function canManagePrompts(hasPermission: (code: string) => boolean, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || hasPermission("prompts.manage");
}

export function canPublishPrompts(hasPermission: (code: string) => boolean, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || hasPermission("prompts.publish");
}

export function canPreviewPrompts(hasPermission: (code: string) => boolean, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || hasPermission("prompts.preview");
}

export function canRollbackPrompts(hasPermission: (code: string) => boolean, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || hasPermission("prompts.rollback");
}
