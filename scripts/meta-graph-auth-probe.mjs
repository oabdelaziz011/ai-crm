import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const p of [resolve(root, ".env")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

const rpc = await fetch(`${url}/rest/v1/rpc/get_company_whatsapp_settings_decrypted`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ p_company_id: COMPANY_ID }),
});
const wa = await rpc.json();
const token = typeof wa.access_token === "string" ? wa.access_token : "";
const phoneNumberId = wa.phone_number_id || "1214681355059951";
const graphApiVersion = wa.api_version || "v21.0";
const endpoint = `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`;

const graph = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "201023169075",
    type: "text",
    text: { body: "meta-auth-probe" },
  }),
});
const rawGraphResponseBody = await graph.json();

console.log(
  JSON.stringify(
    {
      httpStatus: graph.status,
      endpoint,
      phoneNumberId,
      graphApiVersion,
      accessTokenPresent: Boolean(token.trim()),
      accessTokenPrefix: token.slice(0, 12),
      accessTokenLength: token.length,
      companyId: COMPANY_ID,
      companyChannelId: "e126113b-6d0e-48d3-9296-a46aafe0cc75",
      rawGraphResponseBody,
      metaError: rawGraphResponseBody.error ?? null,
    },
    null,
    2,
  ),
);

if (token.trim()) {
  const debug = await fetch(
    `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const debugBody = await debug.json();
  console.log(JSON.stringify({ debugToken: debugBody }, null, 2));
}
