/**
 * Compare send capability across token/phone combinations.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  createServiceRoleSupabaseClient,
  loadDevScriptEnv,
  requireEnvValue,
  resolveChannelId,
  resolveWhatsAppTestRecipient,
} from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const argv = process.argv.slice(2);
const CHANNEL_ID = resolveChannelId(argv, env);
const TO = resolveWhatsAppTestRecipient(argv, env);
const sb = createServiceRoleSupabaseClient(env, createClient);
const API = "v21.0";

const { data: channel } = await sb.from("company_channels").select("configuration, company_id").eq("id", CHANNEL_ID).single();
const channelToken = channel.configuration.accessToken;
const channelPhone = channel.configuration.phoneNumberId;

const { data: settings } = await sb.from("company_whatsapp_settings").select("*").eq("company_id", channel.company_id).maybeSingle();
let settingsToken = settings?.access_token ?? "";
if (!settingsToken && settings?.access_token_encrypted) {
  const { data, error } = await sb.rpc("get_company_whatsapp_settings_decrypted", { p_company_id: channel.company_id });
  settingsToken = data?.access_token ?? "";
}
const settingsPhone = settings?.phone_number_id ?? "";

async function send(label, token, phoneId) {
  const url = `https://graph.facebook.com/${API}/${phoneId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: TO,
      type: "text",
      text: { body: `probe: ${label}` },
    }),
  });
  const body = await res.json();
  console.log(`\n=== SEND ${label} ===`);
  console.log(JSON.stringify({
    phoneNumberId: phoneId,
    tokenPrefix: token.slice(0, 12) + "...",
    sameToken: token === channelToken,
    httpStatus: res.status,
    error: body.error?.message ?? null,
    code: body.error?.code ?? null,
    messageId: body.messages?.[0]?.id ?? null,
  }, null, 2));
}

console.log("Channel token prefix:", channelToken.slice(0, 12));
console.log("Settings token prefix:", settingsToken ? settingsToken.slice(0, 12) : "(none)");
console.log("Tokens identical:", channelToken === settingsToken);

await send("channel-token + channel-phone", channelToken, channelPhone);
if (settingsToken && settingsPhone) {
  await send("settings-token + settings-phone", settingsToken, settingsPhone);
}
if (settingsToken && settingsPhone !== channelPhone) {
  await send("settings-token + channel-phone", settingsToken, channelPhone);
}
if (settingsToken && channelToken !== settingsToken) {
  await send("channel-token + settings-phone", channelToken, settingsPhone);
}

// debug_token with app from subscribed apps
const appId = requireEnvValue(env, ["META_APP_ID", "FACEBOOK_APP_ID"], "Meta app id (META_APP_ID)");
const appSecret = env.META_APP_SECRET || env.FACEBOOK_APP_SECRET;
if (appSecret) {
  const appToken = `${appId}|${appSecret}`;
  for (const [label, token] of [["channel", channelToken], ["settings", settingsToken]].filter(([, t]) => t)) {
    const res = await fetch(
      `https://graph.facebook.com/${API}/debug_token?input_token=${encodeURIComponent(token)}`,
      { headers: { Authorization: `Bearer ${appToken}` } },
    );
    const body = await res.json();
    console.log(`\n=== debug_token ${label} ===`);
    console.log(JSON.stringify(body.data ?? body.error, null, 2));
  }
} else {
  console.log("\nNo META_APP_SECRET — skipping debug_token");
}
