/**
 * Reproduce outbound send with production channel credentials.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  createServiceRoleSupabaseClient,
  loadDevScriptEnv,
  resolveChannelId,
  resolveWhatsAppTestRecipient,
} from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const argv = process.argv.slice(2);
const CHANNEL_ID = resolveChannelId(argv, env);
const TO = resolveWhatsAppTestRecipient(argv, env);
const sb = createServiceRoleSupabaseClient(env, createClient);

const { data: channel } = await sb.from("company_channels").select("configuration").eq("id", CHANNEL_ID).single();
const config = channel.configuration;
const apiVersion = config.apiVersion ?? "v21.0";
const phoneNumberId = config.phoneNumberId;
const accessToken = config.accessToken;

console.log("phoneNumberId:", phoneNumberId);
console.log("token length:", accessToken?.length);

const payload = {
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: TO,
  type: "text",
  text: { body: `outbound probe ${new Date().toISOString()}` },
};

const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

const body = await res.json();
console.log("HTTP", res.status);
console.log(JSON.stringify(body, null, 2));

// List phone numbers accessible by token via debug_token granular scopes
const appId = env.META_APP_ID || env.FACEBOOK_APP_ID;
const appSecret = env.META_APP_SECRET || env.FACEBOOK_APP_SECRET;
if (appId && appSecret) {
  const appToken = `${appId}|${appSecret}`;
  const debugRes = await fetch(
    `https://graph.facebook.com/${apiVersion}/debug_token?input_token=${encodeURIComponent(accessToken)}`,
    { headers: { Authorization: `Bearer ${appToken}` } },
  );
  console.log("\ndebug_token:", JSON.stringify(await debugRes.json(), null, 2));
}
