import type { SupabaseClient } from "@supabase/supabase-js";
import { ValidationError } from "../../errors.js";
import type { WhatsAppChannelConfiguration, WhatsAppChannelReferences } from "./whatsapp-config.js";

export const WHATSAPP_CREDENTIALS_SOURCE = "company_whatsapp_settings" as const;

export type WhatsAppCanonicalCredentials = {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  appSecret?: string;
  apiVersion: string;
  businessAccountId?: string;
};

export type WhatsAppCredentialsLoader = {
  loadByCompanyId(companyId: string): Promise<WhatsAppCanonicalCredentials | null>;
};

export type WhatsAppCredentialsLoadDiagnostic = {
  stage: string;
  companyId: string;
  [key: string]: unknown;
};

export type WhatsAppCredentialsLoaderOptions = {
  onDiagnostic?: (detail: WhatsAppCredentialsLoadDiagnostic) => void;
};

type DecryptedSettingsRow = {
  access_token?: string;
  phone_number_id?: string;
  business_account_id?: string;
  webhook_verify_token?: string;
  api_version?: string;
  app_secret?: string;
  has_access_token?: boolean;
  has_webhook_verify_token?: boolean;
  has_app_secret?: boolean;
};

type SettingsTableRow = {
  access_token?: string | null;
  phone_number_id?: string | null;
  business_account_id?: string | null;
  webhook_verify_token?: string | null;
  api_version?: string | null;
  app_secret?: string | null;
  access_token_encrypted?: unknown;
  webhook_verify_token_encrypted?: unknown;
  app_secret_encrypted?: unknown;
};

export async function loadCompanyWhatsAppCredentialsDecrypted(
  client: SupabaseClient,
  companyId: string,
  options: WhatsAppCredentialsLoaderOptions = {},
): Promise<WhatsAppCanonicalCredentials | null> {
  const diag = (stage: string, detail: Record<string, unknown> = {}) => {
    options.onDiagnostic?.({ stage, companyId, ...detail });
  };

  diag("canonical.load.start");

  const { data: decrypted, error: rpcError } = await client.rpc(
    "get_company_whatsapp_settings_decrypted",
    { p_company_id: companyId },
  );

  const rpcRecord =
    decrypted && typeof decrypted === "object" ? (decrypted as DecryptedSettingsRow & Record<string, unknown>) : null;

  diag("canonical.load.rpc", {
    rpcError: rpcError?.message ?? null,
    rpcErrorCode: rpcError?.code ?? null,
    lookupResult: rpcRecord ? "object" : "null",
    recordFound: Boolean(rpcRecord),
    accessTokenPresent: Boolean(
      rpcRecord?.has_access_token ?? (typeof rpcRecord?.access_token === "string" && rpcRecord.access_token.trim()),
    ),
    phoneNumberIdPresent: Boolean(
      typeof rpcRecord?.phone_number_id === "string" && rpcRecord.phone_number_id.trim(),
    ),
    businessAccountIdPresent: Boolean(
      typeof rpcRecord?.business_account_id === "string" && rpcRecord.business_account_id.trim(),
    ),
    webhookVerifyTokenPresent: Boolean(
      rpcRecord?.has_webhook_verify_token ??
        (typeof rpcRecord?.webhook_verify_token === "string" && rpcRecord.webhook_verify_token.trim()),
    ),
    appSecretPresent: Boolean(
      rpcRecord?.has_app_secret ??
        (typeof rpcRecord?.app_secret === "string" && rpcRecord.app_secret.trim()),
    ),
    decryptedAccessTokenSuccess: Boolean(
      typeof rpcRecord?.access_token === "string" && rpcRecord.access_token.trim(),
    ),
    decryptedAppSecretSuccess: Boolean(
      typeof rpcRecord?.app_secret === "string" && rpcRecord.app_secret.trim(),
    ),
  });

  if (!rpcError && rpcRecord) {
    const mapped = mapDecryptedSettings(rpcRecord);
    diag("canonical.load.rpc.mapped", {
      mapped: Boolean(mapped),
      accessTokenPresent: Boolean(mapped?.accessToken.trim()),
      phoneNumberIdPresent: Boolean(mapped?.phoneNumberId.trim()),
      businessAccountIdPresent: Boolean(mapped?.businessAccountId?.trim()),
      webhookVerifyTokenPresent: Boolean(mapped?.verifyToken.trim()),
      appSecretPresent: Boolean(mapped?.appSecret?.trim()),
      source: "company_whatsapp_settings.rpc",
    });
    if (mapped?.accessToken.trim()) {
      return mapped;
    }
  }

  diag("canonical.load.table.start", {
    reason: rpcError ? "rpc_failed" : "rpc_missing_access_token",
  });

  const { data: row, error: tableError } = await client
    .from("company_whatsapp_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  const settingsRow = (row ?? null) as SettingsTableRow | null;

  diag("canonical.load.table", {
    tableError: tableError?.message ?? null,
    recordFound: Boolean(settingsRow),
    accessTokenPresent: Boolean(settingsRow?.access_token?.trim()),
    phoneNumberIdPresent: Boolean(settingsRow?.phone_number_id?.trim()),
    businessAccountIdPresent: Boolean(settingsRow?.business_account_id?.trim()),
    webhookVerifyTokenPresent: Boolean(settingsRow?.webhook_verify_token?.trim()),
    accessTokenEncryptedPresent: Boolean(settingsRow?.access_token_encrypted),
    webhookVerifyTokenEncryptedPresent: Boolean(settingsRow?.webhook_verify_token_encrypted),
    appSecretEncryptedPresent: Boolean(settingsRow?.app_secret_encrypted),
  });

  if (tableError || !settingsRow) {
    diag("canonical.load.table.missing", {
      mapped: false,
      source: "company_whatsapp_settings.table",
    });
    return null;
  }

  if (
    !settingsRow.access_token?.trim() &&
    settingsRow.access_token_encrypted &&
    rpcError
  ) {
    diag("canonical.load.encrypted_only", {
      mapped: false,
      reason: "access_token_encrypted_requires_decrypted_rpc",
      rpcError: rpcError.message,
    });
    return null;
  }

  const mapped = mapDecryptedSettings({
    access_token: settingsRow.access_token ?? "",
    phone_number_id: settingsRow.phone_number_id ?? "",
    business_account_id: settingsRow.business_account_id ?? "",
    webhook_verify_token: settingsRow.webhook_verify_token ?? "",
    api_version: settingsRow.api_version ?? "v21.0",
    app_secret: settingsRow.app_secret ?? "",
  });

  diag("canonical.load.table.mapped", {
    mapped: Boolean(mapped),
    accessTokenPresent: Boolean(mapped?.accessToken.trim()),
    phoneNumberIdPresent: Boolean(mapped?.phoneNumberId.trim()),
    businessAccountIdPresent: Boolean(mapped?.businessAccountId?.trim()),
    webhookVerifyTokenPresent: Boolean(mapped?.verifyToken.trim()),
    appSecretPresent: Boolean(mapped?.appSecret?.trim()),
    source: "company_whatsapp_settings.table",
  });

  return mapped;
}

export function createSupabaseWhatsAppCredentialsLoader(
  client: SupabaseClient,
  options: WhatsAppCredentialsLoaderOptions = {},
): WhatsAppCredentialsLoader {
  return {
    loadByCompanyId: (companyId) => loadCompanyWhatsAppCredentialsDecrypted(client, companyId, options),
  };
}

export async function resolveWhatsAppRuntimeConfiguration(
  companyId: string,
  channelReferences: WhatsAppChannelReferences,
  loader: WhatsAppCredentialsLoader,
  options: WhatsAppCredentialsLoaderOptions = {},
): Promise<WhatsAppChannelConfiguration> {
  const diag = (stage: string, detail: Record<string, unknown> = {}) => {
    options.onDiagnostic?.({ stage, companyId, ...detail });
  };

  diag("canonical.resolve.start", {
    channelPhoneNumberId: channelReferences.phoneNumberId ?? null,
    credentialsSource: channelReferences.credentialsSource ?? null,
  });

  const credentials = await loader.loadByCompanyId(companyId);

  if (!credentials) {
    diag("canonical.resolve.failed", { reason: "settings_missing_or_unreadable" });
    throw new ValidationError(
      "WhatsApp credentials are not configured. Update Settings → WhatsApp Provider.",
    );
  }

  if (!credentials.accessToken.trim()) {
    diag("canonical.resolve.failed", {
      reason: "access_token_missing_in_company_whatsapp_settings",
      phoneNumberIdPresent: Boolean(credentials.phoneNumberId.trim()),
      webhookVerifyTokenPresent: Boolean(credentials.verifyToken.trim()),
      businessAccountIdPresent: Boolean(credentials.businessAccountId?.trim()),
    });
    throw new ValidationError(
      "WhatsApp credentials are not configured. Update Settings → WhatsApp Provider.",
    );
  }

  const phoneNumberId =
    credentials.phoneNumberId.trim() ||
    channelReferences.phoneNumberId?.trim() ||
    "";

  if (!phoneNumberId) {
    diag("canonical.resolve.failed", { reason: "phone_number_id_missing" });
    throw new ValidationError("WhatsApp Phone Number ID is not configured.");
  }

  diag("canonical.resolve.success", {
    phoneNumberId,
    businessAccountId: credentials.businessAccountId ?? null,
    apiVersion: credentials.apiVersion,
    accessTokenPresent: true,
    webhookVerifyTokenPresent: Boolean(credentials.verifyToken.trim()),
    appSecretPresent: Boolean(credentials.appSecret?.trim()),
  });

  return {
    phoneNumberId,
    accessToken: credentials.accessToken.trim(),
    verifyToken: credentials.verifyToken.trim(),
    appSecret: credentials.appSecret?.trim() || undefined,
    apiVersion: credentials.apiVersion.trim() || "v21.0",
    businessAccountId: credentials.businessAccountId?.trim() || undefined,
  };
}

function mapDecryptedSettings(row: DecryptedSettingsRow): WhatsAppCanonicalCredentials | null {
  const accessToken = typeof row.access_token === "string" ? row.access_token.trim() : "";
  const phoneNumberId = typeof row.phone_number_id === "string" ? row.phone_number_id.trim() : "";
  const verifyToken =
    typeof row.webhook_verify_token === "string" ? row.webhook_verify_token.trim() : "";
  const apiVersion =
    typeof row.api_version === "string" && row.api_version.trim()
      ? row.api_version.trim()
      : "v21.0";
  const businessAccountId =
    typeof row.business_account_id === "string" && row.business_account_id.trim()
      ? row.business_account_id.trim()
      : undefined;
  const appSecret =
    typeof row.app_secret === "string" && row.app_secret.trim() ? row.app_secret.trim() : undefined;

  if (!accessToken && !phoneNumberId && !verifyToken) {
    return null;
  }

  return {
    accessToken,
    phoneNumberId,
    verifyToken,
    apiVersion,
    businessAccountId,
    appSecret,
  };
}
