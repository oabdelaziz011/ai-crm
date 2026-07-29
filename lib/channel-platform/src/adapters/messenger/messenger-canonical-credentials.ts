import type { SupabaseClient } from "@supabase/supabase-js";
import { ValidationError } from "../../errors.js";
import { assertChannelSettingsEnabled } from "../../webhooks/webhook-channel-guards.js";
import type { MessengerChannelConfiguration, MessengerChannelReferences } from "./messenger-config.js";

export const MESSENGER_CREDENTIALS_SOURCE = "company_messenger_settings" as const;

export type MessengerCanonicalCredentials = {
  pageId: string;
  accessToken: string;
  verifyToken: string;
  appSecret?: string;
  apiVersion: string;
  enabled?: boolean;
};

export type MessengerCredentialsLoader = {
  loadByCompanyId(companyId: string): Promise<MessengerCanonicalCredentials | null>;
};

type DecryptedSettingsRow = {
  enabled?: boolean;
  access_token?: string;
  page_id?: string;
  webhook_verify_token?: string;
  api_version?: string;
  app_secret?: string;
};

type SettingsTableRow = {
  enabled?: boolean;
  access_token?: string | null;
  page_id?: string | null;
  webhook_verify_token?: string | null;
  api_version?: string | null;
  app_secret?: string | null;
  access_token_encrypted?: unknown;
  webhook_verify_token_encrypted?: unknown;
  app_secret_encrypted?: unknown;
};

export async function loadCompanyMessengerCredentialsDecrypted(
  client: SupabaseClient,
  companyId: string,
): Promise<MessengerCanonicalCredentials | null> {
  const { data: decrypted, error: rpcError } = await client.rpc(
    "get_company_messenger_settings_decrypted",
    { p_company_id: companyId },
  );

  const rpcRecord =
    decrypted && typeof decrypted === "object" ? (decrypted as DecryptedSettingsRow & Record<string, unknown>) : null;

  if (!rpcError && rpcRecord) {
    const mapped = mapDecryptedSettings(rpcRecord);
    if (mapped?.accessToken.trim()) {
      return mapped;
    }
  }

  const { data: row, error: tableError } = await client
    .from("company_messenger_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  const settingsRow = (row ?? null) as SettingsTableRow | null;
  if (tableError || !settingsRow) {
    return null;
  }

  if (!settingsRow.access_token?.trim() && settingsRow.access_token_encrypted && rpcError) {
    return null;
  }

  return mapDecryptedSettings({
    enabled: settingsRow.enabled,
    access_token: settingsRow.access_token ?? "",
    page_id: settingsRow.page_id ?? "",
    webhook_verify_token: settingsRow.webhook_verify_token ?? "",
    api_version: settingsRow.api_version ?? "v21.0",
    app_secret: settingsRow.app_secret ?? "",
  });
}

export function createSupabaseMessengerCredentialsLoader(
  client: SupabaseClient,
): MessengerCredentialsLoader {
  return {
    loadByCompanyId: (companyId) => loadCompanyMessengerCredentialsDecrypted(client, companyId),
  };
}

export async function resolveMessengerRuntimeConfiguration(
  companyId: string,
  channelReferences: MessengerChannelReferences,
  loader: MessengerCredentialsLoader,
): Promise<MessengerChannelConfiguration> {
  const credentials = await loader.loadByCompanyId(companyId);
  assertChannelSettingsEnabled(credentials, "Messenger");

  if (!credentials?.accessToken.trim()) {
    throw new ValidationError(
      "Messenger credentials are not configured. Update company Messenger settings.",
    );
  }

  const pageId = credentials.pageId.trim() || channelReferences.pageId?.trim() || "";
  if (!pageId) {
    throw new ValidationError("Messenger Page ID is not configured.");
  }

  return {
    pageId,
    accessToken: credentials.accessToken.trim(),
    verifyToken: credentials.verifyToken.trim(),
    appSecret: credentials.appSecret?.trim() || undefined,
    apiVersion: credentials.apiVersion.trim() || "v21.0",
    enabled: credentials.enabled,
  };
}

function mapDecryptedSettings(row: DecryptedSettingsRow): MessengerCanonicalCredentials | null {
  const accessToken = typeof row.access_token === "string" ? row.access_token.trim() : "";
  const pageId = typeof row.page_id === "string" ? row.page_id.trim() : "";
  const verifyToken =
    typeof row.webhook_verify_token === "string" ? row.webhook_verify_token.trim() : "";
  const apiVersion =
    typeof row.api_version === "string" && row.api_version.trim() ? row.api_version.trim() : "v21.0";
  const appSecret =
    typeof row.app_secret === "string" && row.app_secret.trim() ? row.app_secret.trim() : undefined;

  if (!accessToken && !pageId && !verifyToken) {
    return null;
  }

  return {
    accessToken,
    pageId,
    verifyToken,
    apiVersion,
    appSecret,
    enabled: row.enabled,
  };
}
