/** Email Workspace tab permissions. Module shell remains email.view + email_channel. */
export const EMAIL_TEMPLATES_TAB_PERMISSION = "email.templates.view";
export const EMAIL_ROUTING_TAB_PERMISSION = "email.routing.view";
/** Settings tab visibility (migration 363). Not Connection mutations. */
export const EMAIL_SETTINGS_TAB_PERMISSION = "ai.email.manage";
/** Company mailbox Connection (SMTP/IMAP/Gmail/Graph). */
export const EMAIL_CONNECTION_PERMISSION = "email.settings.manage";
export const EMAIL_PERSONAL_IDENTITY_PERMISSION = "email.identity.manage";
export const EMAIL_COMPANY_IDENTITY_PERMISSION = "email.identity.company.manage";

export function canManageEmailConnectionPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  return (
    hasPermission(EMAIL_CONNECTION_PERMISSION) ||
    hasPermission(EMAIL_SETTINGS_TAB_PERMISSION)
  );
}
