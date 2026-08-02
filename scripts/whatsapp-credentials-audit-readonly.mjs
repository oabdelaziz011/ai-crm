/**
 * Read-only WhatsApp Cloud API credentials audit for VaultOS.
 * Writes: docs/architecture/whatsapp-credentials-audit.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(root, "docs/architecture/whatsapp-credentials-audit.json");
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const CONVERSATION_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";

const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const report = {
  auditedAt: new Date().toISOString(),
  companyId: COMPANY_ID,
  conversationId: CONVERSATION_ID,
};

const { data: conv } = await sb
  .from("conversations")
  .select("id, company_id, conversation_number, external_thread_id, company_channel_id, metadata")
  .eq("id", CONVERSATION_ID)
  .maybeSingle();
report.conversation = conv;

const { data: session } = await sb
  .from("channel_sessions")
  .select("id, external_thread_id, channel_key, company_channel_id, updated_at, deleted_at")
  .eq("conversation_id", CONVERSATION_ID)
  .order("updated_at", { ascending: false })
  .limit(1)
  .maybeSingle();
report.channelSession = session;

const companyChannelId =
  session?.company_channel_id ?? conv?.company_channel_id ?? "e126113b-6d0e-48d3-9296-a46aafe0cc75";

const { data: channel } = await sb
  .from("company_channels")
  .select("id, company_id, channel_type, display_name, is_enabled, configuration, deleted_at")
  .eq("id", companyChannelId)
  .maybeSingle();
report.companyChannel = channel
  ? {
      id: channel.id,
      companyId: channel.company_id,
      channelType: channel.channel_type,
      displayName: channel.display_name,
      isEnabled: channel.is_enabled,
      deletedAt: channel.deleted_at,
      configuration: channel.configuration,
    }
  : null;

const { data: waDecrypted, error: waRpcError } = await sb.rpc("get_company_whatsapp_settings_decrypted", {
  p_company_id: COMPANY_ID,
});

const { data: waPublic } = await sb.rpc("get_company_whatsapp_settings", {
  p_company_id: COMPANY_ID,
});

const token = typeof waDecrypted?.access_token === "string" ? waDecrypted.access_token.trim() : "";
const apiVersion =
  (typeof waDecrypted?.api_version === "string" && waDecrypted.api_version.trim()) ||
  (typeof waPublic?.api_version === "string" && waPublic.api_version.trim()) ||
  "v21.0";

report.credentials = {
  companyId: COMPANY_ID,
  companyChannelId,
  phoneNumberId: waDecrypted?.phone_number_id ?? waPublic?.phone_number_id ?? channel?.configuration?.phoneNumberId ?? null,
  wabaId: waDecrypted?.business_account_id ?? waPublic?.business_account_id ?? null,
  metaAppId: null,
  accessTokenLength: token.length,
  accessTokenPrefix: token.slice(0, 12),
  tokenExpiresAt: null,
  tokenSource: "company_whatsapp_settings.get_company_whatsapp_settings_decrypted",
  graphApiVersion: apiVersion,
  hasAccessToken: Boolean(token),
  hasWebhookVerifyToken: Boolean(waDecrypted?.webhook_verify_token?.trim() || waPublic?.has_webhook_verify_token),
  hasAppSecret: Boolean(waDecrypted?.app_secret?.trim() || waPublic?.has_app_secret),
  provider: waPublic?.provider ?? null,
  enabled: waPublic?.enabled ?? null,
  rpcError: waRpcError?.message ?? null,
};

report.validity = {
  tokenExpired: null,
  phoneNumberRegistered: null,
  graphVersionValid: null,
  tokenBelongsToPhoneNumber: null,
  tokenType: null,
};

if (token) {
  const phoneNumberId = report.credentials.phoneNumberId;
  if (phoneNumberId) {
    const phoneResp = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,status,code_verification_status`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const phoneBody = await phoneResp.json();
    report.phoneNumberCheck = {
      httpStatus: phoneResp.status,
      ok: phoneResp.ok,
      id: phoneBody.id ?? null,
      displayPhoneNumber: phoneBody.display_phone_number ?? null,
      verifiedName: phoneBody.verified_name ?? null,
      status: phoneBody.status ?? null,
      error: phoneBody.error ?? null,
    };
    report.validity.phoneNumberRegistered = phoneResp.ok && Boolean(phoneBody.id);
    report.validity.tokenBelongsToPhoneNumber = phoneResp.ok;
  }

  const debugResp = await fetch(
    `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const debugBody = await debugResp.json();
  const data = debugBody?.data ?? {};
  report.tokenDebug = {
    httpStatus: debugResp.status,
    ok: debugResp.ok,
    isValid: data.is_valid ?? null,
    appId: data.app_id ?? null,
    type: data.type ?? null,
    expiresAt: data.expires_at ? new Date(data.expires_at * 1000).toISOString() : null,
    dataAccessExpiresAt: data.data_access_expires_at
      ? new Date(data.data_access_expires_at * 1000).toISOString()
      : null,
    issuedAt: data issued_at ? new Date(data.issued_at * 1000).toISOString() : null,
    scopes: data.scopes ?? null,
    granularScopes: data.granular_scopes ?? null,
    error: debugBody?.error ?? null,
  };
  report.credentials.metaAppId = data.app_id ?? null;
  report.credentials.tokenExpiresAt = report.tokenDebug.expiresAt;

  const nowSec = Math.floor(Date.now() / 1000);
  report.validity.tokenExpired =
    data.is_valid === false ||
    (typeof data.expires_at === "number" && data.expires_at > 0 && data.expires_at < nowSec);
  report.validity.tokenType =
    data.type === "SYSTEM_USER" || data.type === "PAGE"
      ? "permanent_system_user_or_page_token"
      : data.expires_at === 0 || data.expires_at == null
        ? "non_expiring_or_unknown"
        : "temporary_user_token";

  if (report.credentials.wabaId) {
    const wabaResp = await fetch(
      `https://graph.facebook.com/${apiVersion}/${report.credentials.wabaId}?fields=id,name`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    report.wabaCheck = {
      httpStatus: wabaResp.status,
      ok: wabaResp.ok,
      body: await wabaResp.json(),
    };
  }

  const versionProbe = await fetch(`https://graph.facebook.com/${apiVersion}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  report.graphVersionProbe = {
    apiVersion,
    httpStatus: versionProbe.status,
    ok: versionProbe.status !== 404,
  };
  report.validity.graphVersionValid = versionProbe.status !== 404;
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
