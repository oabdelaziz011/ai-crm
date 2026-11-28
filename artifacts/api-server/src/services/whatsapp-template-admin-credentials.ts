/**
 * Credential loader for WhatsApp Meta template administration (list/sync/provision).
 *
 * Template management is independent of outbound messaging (`settings.enabled`).
 * Requires company-scoped WABA + decrypted access token with Meta
 * `whatsapp_business_management` (enforced by Meta Graph; permission failures
 * are mapped by the template Meta client).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyWhatsAppSettings } from "@login-app/lib/notifications/providers/whatsapp/types/whatsapp-types";

export type WhatsAppTemplateAdminCredentialsErrorCode =
  | "settings_missing"
  | "token_missing"
  | "waba_missing";

export class WhatsAppTemplateAdminCredentialsError extends Error {
  readonly code: WhatsAppTemplateAdminCredentialsErrorCode;
  readonly statusCode: number;

  constructor(
    code: WhatsAppTemplateAdminCredentialsErrorCode,
    message: string,
    statusCode = 400,
  ) {
    super(message);
    this.name = "WhatsAppTemplateAdminCredentialsError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type WhatsAppTemplateAdminCredentials = {
  companyId: string;
  accessToken: string;
  businessAccountId: string;
  apiVersion: string;
  defaultLanguage: string;
  /** Outbound send flag — informational only; never gated here. */
  messagingEnabled: boolean;
  phoneNumberId: string;
};

export type WhatsAppSecureSettingsLoader = {
  getSecure(companyId: string): Promise<CompanyWhatsAppSettings | null>;
};

/**
 * Load company-scoped Meta credentials for template administration.
 * Does NOT require settings.enabled.
 */
export async function resolveWhatsAppTemplateAdminCredentials(
  settings: CompanyWhatsAppSettings | null | undefined,
  companyId: string,
): Promise<WhatsAppTemplateAdminCredentials> {
  const trimmedCompanyId = companyId.trim();
  if (!trimmedCompanyId) {
    throw new WhatsAppTemplateAdminCredentialsError(
      "settings_missing",
      "companyId is required for WhatsApp template administration.",
      400,
    );
  }

  if (!settings) {
    throw new WhatsAppTemplateAdminCredentialsError(
      "settings_missing",
      "WhatsApp settings are not configured for this company.",
      400,
    );
  }

  const accessToken = String(settings.accessToken ?? "").trim();
  if (!settings.hasAccessToken || !accessToken) {
    throw new WhatsAppTemplateAdminCredentialsError(
      "token_missing",
      "WhatsApp access token is missing. Add a company Meta token with whatsapp_business_management to manage templates.",
      400,
    );
  }

  const businessAccountId = String(settings.businessAccountId ?? "").trim();
  if (!businessAccountId) {
    throw new WhatsAppTemplateAdminCredentialsError(
      "waba_missing",
      "WhatsApp business account id (WABA) is missing. Connect a company WABA before managing templates.",
      400,
    );
  }

  return {
    companyId: trimmedCompanyId,
    accessToken,
    businessAccountId,
    apiVersion: String(settings.apiVersion ?? "v21.0").trim() || "v21.0",
    defaultLanguage: String(settings.defaultLanguage ?? "en").trim() || "en",
    messagingEnabled: Boolean(settings.enabled),
    phoneNumberId: String(settings.phoneNumberId ?? "").trim(),
  };
}

/**
 * Decrypt company WhatsApp settings and resolve template-admin credentials.
 * Tenant isolation: loads only the requested companyId via getSecure(companyId).
 */
export async function loadWhatsAppTemplateAdminCredentials(
  client: SupabaseClient,
  companyId: string,
  options?: {
    settingsLoader?: WhatsAppSecureSettingsLoader;
  },
): Promise<{ client: SupabaseClient; credentials: WhatsAppTemplateAdminCredentials }> {
  const trimmedCompanyId = companyId.trim();
  const settingsLoader =
    options?.settingsLoader ??
    (await (async () => {
      const { WhatsAppSettingsRepository } = await import(
        "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-settings-repository.js"
      );
      return new WhatsAppSettingsRepository(client);
    })());

  const settings = await settingsLoader.getSecure(trimmedCompanyId);
  const credentials = await resolveWhatsAppTemplateAdminCredentials(settings, trimmedCompanyId);
  return { client, credentials };
}
