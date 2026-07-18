export function canAccessWorkspace(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
  hasCompany: boolean,
): boolean {
  if (isSuperAdmin) return true;
  if (!hasCompany) return false;
  return (
    hasPermission("workspace.view") ||
    hasPermission("billing.view_own") ||
    hasPermission("subscriptions.view")
  );
}

export function canViewWorkspaceBilling(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
  hasCompany: boolean,
): boolean {
  return canAccessWorkspace(hasPermission, isSuperAdmin, hasCompany);
}

export function canManageOwnBilling(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("billing.manage_own");
}

export function canEditOwnBillingContact(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return (
    isSuperAdmin ||
    hasPermission("billing.edit") ||
    hasPermission("billing.manage_own") ||
    hasPermission("billing.contact.edit_own")
  );
}

export function canManageOwnPaymentMethod(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return (
    isSuperAdmin ||
    hasPermission("billing.edit") ||
    hasPermission("billing.payment_method.manage_own")
  );
}

export function canDownloadOwnBillingDocuments(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("billing.documents.download_own") || hasPermission("billing.view_own");
}
