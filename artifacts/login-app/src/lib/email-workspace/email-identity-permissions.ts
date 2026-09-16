/**
 * Email Connection / Identity permission codes.
 * Email Workspace shell stays email.view + email_channel.
 * Migration 363 Settings tab visibility stays ai.email.manage.
 */

/** Company mailbox Connection (SMTP/IMAP/Gmail/Graph). */
export const EMAIL_CONNECTION_PERMISSION = "email.settings.manage";

/** Personal Email Identity (own sender/signature only). */
export const EMAIL_PERSONAL_IDENTITY_PERMISSION = "email.identity.manage";

/** Company Email Identity defaults (logo, company sender, reply-to, company signature). */
export const EMAIL_COMPANY_IDENTITY_PERMISSION = "email.identity.company.manage";

/** 363 Settings tab — opens Email Settings; not Connection/Identity mutations. */
export const EMAIL_SETTINGS_LEGACY_PERMISSION = "ai.email.manage";

export const EMAIL_SETTINGS_ACCESS_PERMISSIONS = [
  EMAIL_SETTINGS_LEGACY_PERMISSION,
  EMAIL_CONNECTION_PERMISSION,
  EMAIL_PERSONAL_IDENTITY_PERMISSION,
  EMAIL_COMPANY_IDENTITY_PERMISSION,
] as const;

export function canAccessEmailSettingsPage(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  return EMAIL_SETTINGS_ACCESS_PERMISSIONS.some((code) => hasPermission(code));
}

export function canManageEmailConnection(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  return hasPermission(EMAIL_CONNECTION_PERMISSION);
}

export function canManagePersonalEmailIdentity(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  return hasPermission(EMAIL_PERSONAL_IDENTITY_PERMISSION);
}

export function canManageCompanyEmailIdentity(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  return hasPermission(EMAIL_COMPANY_IDENTITY_PERMISSION);
}

export function canAccessEmailIdentityTab(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return (
    canManagePersonalEmailIdentity(hasPermission, isSuperAdmin) ||
    canManageCompanyEmailIdentity(hasPermission, isSuperAdmin)
  );
}
