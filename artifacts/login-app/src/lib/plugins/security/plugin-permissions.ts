export const MARKETPLACE_PERMISSIONS = {
  view: "marketplace.view",
  manage: "marketplace.manage",
  install: "marketplace.install",
  develop: "marketplace.develop",
} as const;

export function canViewMarketplace(permissions: string[], isSuperAdmin = false): boolean {
  return isSuperAdmin || permissions.includes(MARKETPLACE_PERMISSIONS.view);
}

export function canManagePlugins(permissions: string[], isSuperAdmin = false): boolean {
  return isSuperAdmin || permissions.includes(MARKETPLACE_PERMISSIONS.manage);
}
