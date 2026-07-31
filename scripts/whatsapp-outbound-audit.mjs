/**
 * Read-only audit: trace outbound WhatsApp credentials and #131005 failures.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  createServiceRoleSupabaseClient,
  loadDevScriptEnv,
  resolveChannelId,
} from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const argv = process.argv.slice(2);
const CHANNEL_ID = resolveChannelId(argv, env);
const sb = createServiceRoleSupabaseClient(env, createClient);

const { data: channel } = await sb
  .from("company_channels")
  .select("configuration, company_id")
  .eq("id", CHANNEL_ID)
  .single();

const config = channel?.configuration ?? {};
const phoneNumberId = config.phoneNumberId ?? null;
const accessToken = config.accessToken ?? null;
const apiVersion = config.apiVersion ?? "v21.0";

console.log("=== CHANNEL CONFIG (redacted) ===");
console.log(
  JSON.stringify(
    {
      phoneNumberId,
      apiVersion,
      hasAccessToken: Boolean(accessToken),
      tokenPrefix: accessToken ? accessToken.slice(0, 12) + "..." : null,
      tokenLength: accessToken?.length ?? 0,
      hasAppSecret: Boolean(config.appSecret),
      hasVerifyToken: Boolean(config.verifyToken),
    },
    null,
    2,
  ),
);

const { data: waSettings } = await sb
  .from("company_whatsapp_settings")
  .select("*")
  .eq("company_id", channel.company_id)
  .maybeSingle();

console.log("\n=== company_whatsapp_settings (redacted) ===");
console.log(
  JSON.stringify(
    {
      enabled: waSettings?.enabled ?? null,
      phone_number_id: waSettings?.phone_number_id ?? null,
      waba_id: waSettings?.waba_id ?? null,
      has_access_token: Boolean(waSettings?.access_token),
      token_prefix: waSettings?.access_token ? waSettings.access_token.slice(0, 12) + "..." : null,
      phone_match: waSettings?.phone_number_id === phoneNumberId,
    },
    null,
    2,
  ),
);

console.log("\n=== RECENT FAILED DELIVERIES ===");
const { data: failed } = await sb
  .from("channel_delivery_events")
  .select("id, created_at, delivery_status, error_message, metadata, attempt_count")
  .eq("company_channel_id", CHANNEL_ID)
  .eq("delivery_status", "failed")
  .order("created_at", { ascending: false })
  .limit(20);

for (const row of failed ?? []) {
  console.log(JSON.stringify(row));
}

console.log("\n=== RECENT DELIVERIES (any status) ===");
const { data: recent } = await sb
  .from("channel_delivery_events")
  .select("id, created_at, delivery_status, error_message, metadata")
  .eq("company_channel_id", CHANNEL_ID)
  .order("created_at", { ascending: false })
  .limit(10);

for (const row of recent ?? []) {
  console.log(JSON.stringify(row));
}

if (accessToken) {
  console.log("\n=== META: debug_token (scopes) ===");
  const appId = env.META_APP_ID || env.FACEBOOK_APP_ID;
  const appSecret = env.META_APP_SECRET || env.FACEBOOK_APP_SECRET;
  if (appId && appSecret) {
    const appToken = `${appId}|${appSecret}`;
    const debugRes = await fetch(
      `https://graph.facebook.com/${apiVersion}/debug_token?input_token=${encodeURIComponent(accessToken)}`,
      { headers: { Authorization: `Bearer ${appToken}` } },
    );
    const debugBody = await debugRes.json();
    const data = debugBody.data ?? {};
    console.log(
      JSON.stringify(
        {
          is_valid: data.is_valid,
          type: data.type,
          app_id: data.app_id,
          scopes: data.scopes,
          granular_scopes: data.granular_scopes,
          expires_at: data.expires_at,
          error: debugBody.error ?? null,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("Skipped: META_APP_ID / META_APP_SECRET not in env");
  }

  console.log("\n=== META: test outbound POST (dry - invalid recipient to capture error shape) ===");
  const testPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "0000000000",
    type: "text",
    text: { body: "audit probe" },
  };
  const sendRes = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testPayload),
    },
  );
  const sendBody = await sendRes.json();
  console.log(JSON.stringify({ httpStatus: sendRes.status, body: sendBody }, null, 2));
}
