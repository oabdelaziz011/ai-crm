export const INTEGRATION_PERMISSIONS = {
  view: "integrations.view",
  manage: "integrations.manage",
  apiKeys: "integrations.api_keys",
  webhooks: "integrations.webhooks",
} as const;

export function canViewIntegrations(permissions: string[], isSuperAdmin = false): boolean {
  return isSuperAdmin || permissions.includes(INTEGRATION_PERMISSIONS.view);
}

export function canManageIntegrations(permissions: string[], isSuperAdmin = false): boolean {
  return isSuperAdmin || permissions.includes(INTEGRATION_PERMISSIONS.manage);
}
