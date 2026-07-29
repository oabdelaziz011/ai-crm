import type { SupabaseClient } from "@supabase/supabase-js";
import { ValidationError } from "../../errors.js";
import { assertChannelSettingsEnabled } from "../../webhooks/webhook-channel-guards.js";
import type { InstagramChannelConfiguration, InstagramChannelReferences } from "./instagram-config.js";

export const INSTAGRAM_CREDENTIALS_SOURCE = "company_instagram_settings" as const;

export type InstagramCanonicalCredentials = {
  instagramBusinessAccountId: string;
  pageId?: string;
  accessToken: string;
  verifyToken: string;
  appSecret?: string;
  apiVersion: string;
  enabled?: boolean;
};

export type InstagramCredentialsLoader = {
  loadByCompanyId(companyId: string): Promise<InstagramCanonicalCredentials | null>;
};

type DecryptedSettingsRow = {
  enabled?: boolean;
  access_token?: string;
  page_id?: string;
  instagram_business_account_id?: string;
  webhook_verify_token?: string;
  api_version?: string;
  app_secret?: string;
  has_access_token?: boolean;
  has_webhook_verify_token?: boolean;
  has_app_secret?: boolean;
};

type SettingsTableRow = {
  access_token?: string | null;
  page_id?: string | null;
  instagram_business_account_id?: string | null;
  webhook_verify_token?: string | null;
  api_version?: string | null;
  app_secret?: string | null;
  access_token_encrypted?: unknown;
  webhook_verify_token_encrypted?: unknown;
  app_secret_encrypted?: unknown;
};

export async function loadCompanyInstagramCredentialsDecrypted(
  client: SupabaseClient,
  companyId: string,
): Promise<InstagramCanonicalCredentials | null> {
  const { data: decrypted, error: rpcError } = await client.rpc(
    "get_company_instagram_settings_decrypted",
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
    .from("company_instagram_settings")
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
    access_token: settingsRow.access_token ?? "",
    page_id: settingsRow.page_id ?? "",
    instagram_business_account_id: settingsRow.instagram_business_account_id ?? "",
    webhook_verify_token: settingsRow.webhook_verify_token ?? "",
    api_version: settingsRow.api_version ?? "v21.0",
    app_secret: settingsRow.app_secret ?? "",
  });
}

export function createSupabaseInstagramCredentialsLoader(
  client: SupabaseClient,
): InstagramCredentialsLoader {
  return {
    loadByCompanyId: (companyId) => loadCompanyInstagramCredentialsDecrypted(client, companyId),
  };
}

export async function resolveInstagramRuntimeConfiguration(
  companyId: string,
  channelReferences: InstagramChannelReferences,
  loader: InstagramCredentialsLoader,
): Promise<InstagramChannelConfiguration> {
  const credentials = await loader.loadByCompanyId(companyId);
  assertChannelSettingsEnabled(credentials, "Instagram");

  if (!credentials?.accessToken.trim()) {
    throw new ValidationError(
      "Instagram credentials are not configured. Update company Instagram settings.",
    );
  }

  const instagramBusinessAccountId =
    credentials.instagramBusinessAccountId.trim() ||
    channelReferences.instagramBusinessAccountId?.trim() ||
    "";

  if (!instagramBusinessAccountId) {
    throw new ValidationError("Instagram Business Account ID is not configured.");
  }

  return {
    instagramBusinessAccountId,
    pageId: credentials.pageId?.trim() || channelReferences.pageId?.trim() || undefined,
    accessToken: credentials.accessToken.trim(),
    verifyToken: credentials.verifyToken.trim(),
    appSecret: credentials.appSecret?.trim() || undefined,
    apiVersion: credentials.apiVersion.trim() || "v21.0",
  };
}

function mapDecryptedSettings(row: DecryptedSettingsRow): InstagramCanonicalCredentials | null {
  const accessToken = typeof row.access_token === "string" ? row.access_token.trim() : "";
  const instagramBusinessAccountId =
    typeof row.instagram_business_account_id === "string" ? row.instagram_business_account_id.trim() : "";
  const verifyToken =
    typeof row.webhook_verify_token === "string" ? row.webhook_verify_token.trim() : "";
  const apiVersion =
    typeof row.api_version === "string" && row.api_version.trim() ? row.api_version.trim() : "v21.0";
  const pageId = typeof row.page_id === "string" && row.page_id.trim() ? row.page_id.trim() : undefined;
  const appSecret =
    typeof row.app_secret === "string" && row.app_secret.trim() ? row.app_secret.trim() : undefined;

  if (!accessToken && !instagramBusinessAccountId && !verifyToken) {
    return null;
  }

  return {
    accessToken,
    instagramBusinessAccountId,
    verifyToken,
    apiVersion,
    pageId,
    appSecret,
    enabled: row.enabled,
  };
}
