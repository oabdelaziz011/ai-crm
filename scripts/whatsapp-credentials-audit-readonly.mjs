/**
 * Read-only WhatsApp Cloud API credentials audit for ValueOR / VaultOS.
 *
 * Distinguishes:
 * - configured settings phone / WABA
 * - company_channel configuration phoneNumberId(s)
 * - conversation metadata.phoneNumberId (create-time snapshot)
 * - Meta Graph validity for the stored access token
 *
 * Usage:
 *   node scripts/whatsapp-credentials-audit-readonly.mjs
 *   COMPANY_ID=... CONVERSATION_ID=... node scripts/whatsapp-credentials-audit-readonly.mjs
 *
 * Writes: docs/architecture/whatsapp-credentials-audit.json
 * Never prints full access tokens / verify tokens / app secrets.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";

/** Safe token fingerprint — never includes plaintext secrets. */
function fingerprintAccessToken(token) {
  const trimmed = typeof token === "string" ? token.trim() : "";
  if (!trimmed) {
    return { present: false, length: 0, prefix: null, sha256_12: null };
  }
  return {
    present: true,
    length: trimmed.length,
    prefix: trimmed.slice(0, 12),
    sha256_12: createHash("sha256").update(trimmed).digest("hex").slice(0, 12),
  };
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(root, "docs/architecture/whatsapp-credentials-audit.json");

const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}

const COMPANY_ID =
  process.env.COMPANY_ID?.trim() ||
  env.WHATSAPP_AUDIT_COMPANY_ID ||
  "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const CONVERSATION_ID =
  process.env.CONVERSATION_ID?.trim() ||
  env.WHATSAPP_AUDIT_CONVERSATION_ID ||
  "a35d7fff-cac7-47f3-9604-df683e726b71";
const EXPECTED_META_PHONE_NUMBER_ID = process.env.EXPECTED_META_PHONE_NUMBER_ID?.trim() || null;
const EXPECTED_META_WABA_ID = process.env.EXPECTED_META_WABA_ID?.trim() || null;

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function metaAuthExpired(error) {
  if (!error || typeof error !== "object") return false;
  const code = error.code;
  const subcode = error.error_subcode ?? error.subcode;
  const message = String(error.message ?? "");
  return (
    code === 190 &&
    (subcode === 463 || /session has expired|token.*(expired|expire)/i.test(message))
  );
}

function uniqueStrings(values) {
  return [...new Set(values.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim()))];
}

const report = {
  auditedAt: new Date().toISOString(),
  companyId: COMPANY_ID,
  conversationId: CONVERSATION_ID,
  expectedMeta: {
    phoneNumberId: EXPECTED_META_PHONE_NUMBER_ID,
    wabaId: EXPECTED_META_WABA_ID,
    note: "Pass EXPECTED_META_PHONE_NUMBER_ID / EXPECTED_META_WABA_ID to compare against Meta Console (not stored).",
  },
};

const { data: conv } = await sb
  .from("conversations")
  .select("id, company_id, conversation_number, external_thread_id, company_channel_id, metadata")
  .eq("id", CONVERSATION_ID)
  .maybeSingle();
report.conversation = conv
  ? {
      id: conv.id,
      companyId: conv.company_id,
      conversationNumber: conv.conversation_number,
      companyChannelId: conv.company_channel_id,
      metadataPhoneNumberId:
        typeof conv.metadata?.phoneNumberId === "string" ? conv.metadata.phoneNumberId : null,
      metadataNote:
        "conversation.metadata.phoneNumberId is a create-time snapshot from the inbound webhook; it is not used for Graph send routing.",
    }
  : null;

const { data: session } = await sb
  .from("channel_sessions")
  .select("id, external_thread_id, channel_key, company_channel_id, updated_at, deleted_at")
  .eq("conversation_id", CONVERSATION_ID)
  .order("updated_at", { ascending: false })
  .limit(1)
  .maybeSingle();
report.channelSession = session;

const conversationChannelId =
  session?.company_channel_id ?? conv?.company_channel_id ?? null;

const { data: allChannels, error: channelsError } = await sb
  .from("company_channels")
  .select(
    "id, company_id, display_name, is_enabled, deleted_at, configuration, communication_channel:channel_id(key)",
  )
  .eq("company_id", COMPANY_ID);

const whatsappChannels = (allChannels ?? [])
  .filter((row) => row.communication_channel?.key === "whatsapp")
  .map((row) => ({
    id: row.id,
    displayName: row.display_name,
    isEnabled: row.is_enabled,
    deletedAt: row.deleted_at,
    phoneNumberId:
      typeof row.configuration?.phoneNumberId === "string" ? row.configuration.phoneNumberId : null,
    credentialsSource:
      typeof row.configuration?.credentialsSource === "string"
        ? row.configuration.credentialsSource
        : null,
    isConversationChannel: row.id === conversationChannelId,
  }));

report.whatsappChannels = {
  error: channelsError?.message ?? null,
  count: whatsappChannels.length,
  enabledCount: whatsappChannels.filter((c) => c.isEnabled && !c.deletedAt).length,
  rows: whatsappChannels,
};

const conversationChannel = whatsappChannels.find((c) => c.id === conversationChannelId) ?? null;
report.companyChannel = conversationChannel;

const { data: waDecrypted, error: waRpcError } = await sb.rpc(
  "get_company_whatsapp_settings_decrypted",
  { p_company_id: COMPANY_ID },
);

const { data: waPublic } = await sb.rpc("get_company_whatsapp_settings", {
  p_company_id: COMPANY_ID,
});

const token = typeof waDecrypted?.access_token === "string" ? waDecrypted.access_token.trim() : "";
const tokenFp = fingerprintAccessToken(token);
const apiVersion =
  (typeof waDecrypted?.api_version === "string" && waDecrypted.api_version.trim()) ||
  (typeof waPublic?.api_version === "string" && waPublic.api_version.trim()) ||
  "v21.0";

const settingsPhoneNumberId =
  (typeof waDecrypted?.phone_number_id === "string" && waDecrypted.phone_number_id.trim()) ||
  (typeof waPublic?.phone_number_id === "string" && waPublic.phone_number_id.trim()) ||
  null;
const settingsWabaId =
  (typeof waDecrypted?.business_account_id === "string" && waDecrypted.business_account_id.trim()) ||
  (typeof waPublic?.business_account_id === "string" && waPublic.business_account_id.trim()) ||
  null;

const channelPhoneNumberIds = uniqueStrings(whatsappChannels.map((c) => c.phoneNumberId));
const conversationPhoneNumberId = report.conversation?.metadataPhoneNumberId ?? null;

report.credentials = {
  companyId: COMPANY_ID,
  conversationCompanyChannelId: conversationChannelId,
  settingsPhoneNumberId,
  settingsWabaId,
  channelPhoneNumberIds,
  conversationMetadataPhoneNumberId: conversationPhoneNumberId,
  accessTokenLength: tokenFp.length,
  accessTokenPrefix: tokenFp.prefix,
  accessTokenFingerprint: tokenFp,
  tokenExpiresAt: null,
  tokenSource: "company_whatsapp_settings.get_company_whatsapp_settings_decrypted",
  tokenFrom: "database",
  graphApiVersion: apiVersion,
  hasAccessToken: Boolean(token),
  hasWebhookVerifyToken: Boolean(
    waDecrypted?.webhook_verify_token?.trim() || waPublic?.has_webhook_verify_token,
  ),
  hasAppSecret: Boolean(waDecrypted?.app_secret?.trim() || waPublic?.has_app_secret),
  provider: waPublic?.provider ?? null,
  enabled: waPublic?.enabled ?? null,
  tokenStatus: waPublic?.token_status ?? null,
  tokenCheckedAt: waPublic?.token_checked_at ?? null,
  rpcError: waRpcError?.message ?? null,
  note:
    "token_status is a stored lifecycle column (updated by Test Connection / outbound), not a live Graph probe. Compare accessTokenFingerprint.sha256_12 with api-server [whatsapp.test-connection] logs.",
};

console.info("[whatsapp.audit.token]", {
  at: report.auditedAt,
  companyId: COMPANY_ID,
  phoneNumberId: settingsPhoneNumberId,
  businessAccountId: settingsWabaId,
  tokenSource: report.credentials.tokenSource,
  tokenFrom: "database",
  ...tokenFp,
  storedTokenStatus: report.credentials.tokenStatus,
});

report.mismatches = {
  settingsVsChannels: Boolean(
    settingsPhoneNumberId &&
      channelPhoneNumberIds.length > 0 &&
      !channelPhoneNumberIds.includes(settingsPhoneNumberId),
  ),
  settingsVsConversationMetadata: Boolean(
    settingsPhoneNumberId &&
      conversationPhoneNumberId &&
      settingsPhoneNumberId !== conversationPhoneNumberId,
  ),
  settingsVsExpectedMeta: Boolean(
    EXPECTED_META_PHONE_NUMBER_ID &&
      settingsPhoneNumberId &&
      settingsPhoneNumberId !== EXPECTED_META_PHONE_NUMBER_ID,
  ),
  wabaVsExpectedMeta: Boolean(
    EXPECTED_META_WABA_ID && settingsWabaId && settingsWabaId !== EXPECTED_META_WABA_ID,
  ),
  conversationChannelMissing: Boolean(conversationChannelId && !conversationChannel),
  conversationChannelDeleted: Boolean(conversationChannel?.deletedAt),
  noEnabledWhatsAppChannel: whatsappChannels.filter((c) => c.isEnabled && !c.deletedAt).length === 0,
};

report.validity = {
  tokenExpired: null,
  phoneNumberRegistered: null,
  graphVersionValid: null,
  tokenBelongsToPhoneNumber: null,
  tokenBelongsToExpectedMetaPhone: null,
  tokenType: null,
  authFailureCode: null,
  authFailureSubcode: null,
};

if (token) {
  const phoneNumberId = settingsPhoneNumberId;
  if (phoneNumberId) {
    const phoneResp = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,status,code_verification_status`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const phoneBody = await phoneResp.json();
    report.phoneNumberCheck = {
      target: "settingsPhoneNumberId",
      phoneNumberId,
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
    if (metaAuthExpired(phoneBody.error)) {
      report.validity.tokenExpired = true;
      report.validity.authFailureCode = phoneBody.error.code;
      report.validity.authFailureSubcode = phoneBody.error.error_subcode ?? null;
    }
  }

  if (EXPECTED_META_PHONE_NUMBER_ID && EXPECTED_META_PHONE_NUMBER_ID !== phoneNumberId) {
    const expectedPhoneResp = await fetch(
      `https://graph.facebook.com/${apiVersion}/${EXPECTED_META_PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name,status`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const expectedPhoneBody = await expectedPhoneResp.json();
    report.expectedMetaPhoneNumberCheck = {
      target: "EXPECTED_META_PHONE_NUMBER_ID",
      phoneNumberId: EXPECTED_META_PHONE_NUMBER_ID,
      httpStatus: expectedPhoneResp.status,
      ok: expectedPhoneResp.ok,
      id: expectedPhoneBody.id ?? null,
      displayPhoneNumber: expectedPhoneBody.display_phone_number ?? null,
      error: expectedPhoneBody.error ?? null,
    };
    report.validity.tokenBelongsToExpectedMetaPhone = expectedPhoneResp.ok;
    if (metaAuthExpired(expectedPhoneBody.error)) {
      report.validity.tokenExpired = true;
      report.validity.authFailureCode = expectedPhoneBody.error.code;
      report.validity.authFailureSubcode = expectedPhoneBody.error.error_subcode ?? null;
    }
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
    issuedAt: data.issued_at ? new Date(data.issued_at * 1000).toISOString() : null,
    scopes: data.scopes ?? null,
    error: debugBody?.error ?? null,
  };
  report.credentials.metaAppId = data.app_id ?? null;
  report.credentials.tokenExpiresAt = report.tokenDebug.expiresAt;

  const nowSec = Math.floor(Date.now() / 1000);
  const expiredFromDebug =
    data.is_valid === false ||
    (typeof data.expires_at === "number" && data.expires_at > 0 && data.expires_at < nowSec);
  const expiredFromHttp =
    metaAuthExpired(debugBody?.error) ||
    metaAuthExpired(report.phoneNumberCheck?.error) ||
    report.validity.tokenExpired === true;

  report.validity.tokenExpired = Boolean(expiredFromDebug || expiredFromHttp);
  if (metaAuthExpired(debugBody?.error)) {
    report.validity.authFailureCode = debugBody.error.code;
    report.validity.authFailureSubcode = debugBody.error.error_subcode ?? null;
  }

  if (debugResp.ok && data.type) {
    report.validity.tokenType =
      data.type === "SYSTEM_USER" || data.type === "PAGE"
        ? "permanent_system_user_or_page_token"
        : data.expires_at === 0
          ? "non_expiring_or_unknown"
          : "temporary_user_token";
  } else if (report.validity.tokenExpired) {
    report.validity.tokenType = "expired_or_unreadable";
  } else {
    report.validity.tokenType = "unknown_debug_token_failed";
  }

  if (settingsWabaId) {
    const wabaResp = await fetch(
      `https://graph.facebook.com/${apiVersion}/${settingsWabaId}?fields=id,name`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    report.wabaCheck = {
      target: "settingsWabaId",
      wabaId: settingsWabaId,
      httpStatus: wabaResp.status,
      ok: wabaResp.ok,
      body: await wabaResp.json(),
    };
  }

  if (EXPECTED_META_WABA_ID && EXPECTED_META_WABA_ID !== settingsWabaId) {
    const expectedWabaResp = await fetch(
      `https://graph.facebook.com/${apiVersion}/${EXPECTED_META_WABA_ID}?fields=id,name`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    report.expectedMetaWabaCheck = {
      target: "EXPECTED_META_WABA_ID",
      wabaId: EXPECTED_META_WABA_ID,
      httpStatus: expectedWabaResp.status,
      ok: expectedWabaResp.ok,
      body: await expectedWabaResp.json(),
    };
  }

  const versionProbe = await fetch(`https://graph.facebook.com/${apiVersion}/me?fields=id`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const versionBody = await versionProbe.json().catch(() => ({}));
  report.graphVersionProbe = {
    apiVersion,
    httpStatus: versionProbe.status,
    ok: versionProbe.ok,
    error: versionBody?.error ?? null,
  };
  report.validity.graphVersionValid =
    versionProbe.status !== 404 && !String(versionBody?.error?.message ?? "").includes("Unsupported get request");
}

report.remediation = [];
if (report.validity.tokenExpired) {
  report.remediation.push(
    "Replace the Access Token in Settings → WhatsApp (prefer a permanent System User token). Do not paste tokens into chat.",
  );
}
if (report.mismatches.settingsVsExpectedMeta || report.mismatches.wabaVsExpectedMeta) {
  report.remediation.push(
    "Update Phone Number ID and WABA ID in Settings → WhatsApp to match Meta Developer Console, then Save (this syncs company_channels via upsert).",
  );
}
if (report.mismatches.noEnabledWhatsAppChannel) {
  report.remediation.push(
    "Create or re-enable a WhatsApp company channel under Channels. Webhook routing and outbound require an enabled non-deleted channel.",
  );
}
if (report.mismatches.conversationChannelMissing || report.mismatches.conversationChannelDeleted) {
  report.remediation.push(
    "Conversation points at a missing/deleted company_channel; new inbound messages will attach to an enabled WhatsApp channel after credentials are fixed.",
  );
}
if (!report.credentials.hasAppSecret) {
  report.remediation.push(
    "Set App Secret in Settings → WhatsApp (same as Meta App → Settings → Basic) so webhook signature verification can be enforced.",
  );
}
if (!report.credentials.hasWebhookVerifyToken) {
  report.remediation.push(
    "Set Webhook Verify Token in Settings → WhatsApp and enter the identical value in Meta → WhatsApp → Configuration → Webhook.",
  );
}
if (report.mismatches.settingsVsConversationMetadata) {
  report.remediation.push(
    "Conversation metadata.phoneNumberId is historical only; ignore for send routing after settings/channels are updated.",
  );
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
