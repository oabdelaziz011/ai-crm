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
const { phoneNumberId, accessToken, apiVersion = "v21.0" } = channel.configuration;
const base = `https://graph.facebook.com/${apiVersion}`;
const auth = { Authorization: `Bearer ${accessToken}` };

async function call(label, url, init) {
  const res = await fetch(url, { ...init, headers: { ...auth, ...(init?.headers ?? {}) } });
  const body = await res.json();
  console.log(`\n=== ${label} ===`);
  console.log("URL:", url.replace(accessToken, "[TOKEN]"));
  console.log("HTTP", res.status);
  console.log(JSON.stringify(body, null, 2));
  return { res, body };
}

await call("GET phone number", `${base}/${phoneNumberId}?fields=id,display_phone_number,verified_name,status`, {});
await call("POST invalid recipient", `${base}/${phoneNumberId}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    to: "0000000000",
    type: "text",
    text: { body: "probe" },
  }),
});
await call("POST real recipient", `${base}/${phoneNumberId}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: TO,
    type: "text",
    text: { body: "probe real" },
  }),
});
await call("GET me permissions", `${base}/me?fields=id,name,permissions`, {});
await call("GET token metadata via me", `${base}/debug_token?input_token=${encodeURIComponent(accessToken)}`, {});

// Try WABA phone numbers if we can resolve WABA from recent inbound raw payload
const { data: inbound } = await sb
  .from("channel_inbound_events")
  .select("payload")
  .eq("company_channel_id", CHANNEL_ID)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

const wabaEntryId = inbound?.payload?.raw?.entry?.[0]?.id;
if (wabaEntryId) {
  await call("GET WABA from inbound entry id", `${base}/${wabaEntryId}?fields=id,name,phone_numbers`, {});
  await call("GET WABA subscribed_apps", `${base}/${wabaEntryId}/subscribed_apps`, {});
}
