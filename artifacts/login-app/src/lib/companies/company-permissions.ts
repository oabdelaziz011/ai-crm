export function canViewCompanies(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("companies.view");
}

export function canCreateCompanies(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("companies.create");
}

export function canEditCompanies(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("companies.edit");
}

export function canDeleteCompanies(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("companies.delete");
}

/** Commercial approval / Features & Access — platform super-admin only. */
export function canManageCompanyCommercialAccess(isSuperAdmin: boolean): boolean {
  return isSuperAdmin;
}
