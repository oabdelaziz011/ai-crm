/**
 * Email Workspace tab permissions.
 * Module shell remains email.view + email_channel.
 * Inbox / Sent / Pending are not gated by these codes.
 */
export const EMAIL_TEMPLATES_TAB_PERMISSION = "email.templates.view";
export const EMAIL_ROUTING_TAB_PERMISSION = "email.routing.view";
/** Email Settings tab visibility (migration 363). Connection/Identity use dedicated codes. */
export const EMAIL_SETTINGS_TAB_PERMISSION = "ai.email.manage";

export {
  EMAIL_CONNECTION_PERMISSION,
  EMAIL_PERSONAL_IDENTITY_PERMISSION,
  EMAIL_COMPANY_IDENTITY_PERMISSION,
  EMAIL_SETTINGS_LEGACY_PERMISSION,
  EMAIL_SETTINGS_ACCESS_PERMISSIONS,
  canAccessEmailSettingsPage,
  canAccessEmailIdentityTab,
  canManageEmailConnection,
  canManagePersonalEmailIdentity,
  canManageCompanyEmailIdentity,
} from "./email-identity-permissions";

export const EMAIL_TAB_PERMISSIONS = [
  EMAIL_TEMPLATES_TAB_PERMISSION,
  EMAIL_ROUTING_TAB_PERMISSION,
  EMAIL_SETTINGS_TAB_PERMISSION,
] as const;

export type EmailTabPermission = (typeof EMAIL_TAB_PERMISSIONS)[number];
