/**
 * Additional Meta probes for 131005 analysis.
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

const { data: channel } = await sb.from("company_channels").select("configuration").eq("id", CHANNEL_ID).single();
const WABA_ID =
  argv[1]?.trim() ||
  env.WHATSAPP_WABA_ID ||
  process.env.WHATSAPP_WABA_ID ||
  channel?.configuration?.businessAccountId ||
  channel?.configuration?.wabaId;
if (!WABA_ID) {
  console.error("Missing WHATSAPP_WABA_ID (argv[2]) and channel configuration has no businessAccountId");
  process.exit(1);
}
const { accessToken, phoneNumberId, apiVersion = "v21.0" } = channel.configuration;
const base = `https://graph.facebook.com/${apiVersion}`;
const auth = { Authorization: `Bearer ${accessToken}` };

async function probe(label, url, init) {
  const res = await fetch(url, { ...init, headers: { ...auth, ...(init?.headers ?? {}) } });
  const body = await res.json();
  console.log(`\n=== ${label} ===`);
  console.log("HTTP", res.status);
  console.log(JSON.stringify(body, null, 2));
  return { res, body };
}

await probe("GET /me", `${base}/me?fields=id,name`);
await probe("GET /me/permissions", `${base}/me/permissions`);
await probe("WABA subscribed_apps", `${base}/${WABA_ID}/subscribed_apps`);
await probe("WABA phone_numbers full", `${base}/${WABA_ID}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status,code_verification_status`);

// Compare whatsapp_settings token if present
const { data: ch } = await sb.from("company_channels").select("company_id").eq("id", CHANNEL_ID).single();
const { data: waSettings } = await sb.from("company_whatsapp_settings").select("*").eq("company_id", ch.company_id).maybeSingle();

console.log("\n=== CREDENTIAL STORE COMPARISON ===");
console.log(JSON.stringify({
  channelPlatform: { phoneNumberId, tokenPrefix: accessToken?.slice(0,12) },
  notificationsSettings: {
    phoneNumberId: waSettings?.phone_number_id,
    wabaId: waSettings?.business_account_id,
    hasToken: Boolean(waSettings?.access_token || waSettings?.access_token_encrypted),
    enabled: waSettings?.enabled,
  },
  phoneNumberIdMismatch: waSettings?.phone_number_id !== phoneNumberId,
  wabaIdMismatch: waSettings?.business_account_id !== WABA_ID,
}, null, 2));

if (waSettings?.access_token) {
  await probe("Settings token GET phone (settings phone ID)", `${base}/${waSettings.phone_number_id}?fields=id,status`, {});
}
