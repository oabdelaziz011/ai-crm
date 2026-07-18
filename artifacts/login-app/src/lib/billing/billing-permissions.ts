export function canViewBilling(hasPermission: (code: string) => boolean, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || hasPermission("billing.view") || hasPermission("subscriptions.view");
}

export function canEditBilling(hasPermission: (code: string) => boolean, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || hasPermission("billing.edit") || hasPermission("subscriptions.edit");
}

export function canViewBillingSettings(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("billing.settings.view");
}

export function canEditBillingSettings(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("billing.settings.edit");
}

export function canViewBillingAudit(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return (
    isSuperAdmin ||
    hasPermission("billing.audit.view") ||
    hasPermission("billing.view")
  );
}

export function canExportBillingAudit(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("billing.audit.export");
}

export function canRecordBillingPayment(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("billing.record_payment");
}

export function canViewBillingHealth(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("billing.health.view") || hasPermission("billing.view");
}

export function canManageBillingHealth(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("billing.health.manage");
}

export function canViewBillingWebhooks(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("billing.webhooks.view") || hasPermission("billing.settings.view");
}

export function canManageBillingWebhooks(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("billing.webhooks.manage");
}

export function canViewBillingReports(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("billing.view_reports") || hasPermission("billing.view");
}

export function canEditOwnBillingContact(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("billing.edit") || hasPermission("billing.contact.edit_own");
}

export function canManageOwnPaymentMethod(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("billing.edit") || hasPermission("billing.payment_method.manage_own");
}

export function canDownloadOwnBillingDocuments(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("billing.view") || hasPermission("billing.documents.download_own");
}
