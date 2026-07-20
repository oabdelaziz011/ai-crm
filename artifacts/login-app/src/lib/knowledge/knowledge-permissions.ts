export function canViewKnowledge(hasPermission: (code: string) => boolean, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || hasPermission("knowledge.view");
}

export function canManageKnowledge(hasPermission: (code: string) => boolean, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || hasPermission("knowledge.manage");
}

export function canImportKnowledge(hasPermission: (code: string) => boolean, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || hasPermission("knowledge.import");
}

export function canPublishKnowledge(hasPermission: (code: string) => boolean, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || hasPermission("knowledge.publish");
}
