/**
 * WhatsApp outbound connection verification (read-only token use, real Meta POST).
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const companyId = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const testRecipient = process.env.WA_E2E_RECIPIENT ?? "201011404109";

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const settingsRes = await c.query(
  "select public.get_company_whatsapp_settings_decrypted($1::uuid) as settings",
  [companyId],
);
const settings = settingsRes.rows[0]?.settings ?? {};
const token = typeof settings.access_token === "string" ? settings.access_token : "";
const apiVersion = settings.api_version || "v21.0";
const phoneNumberId = settings.phone_number_id;

if (!token || !phoneNumberId) {
  console.error(JSON.stringify({ ok: false, reason: "missing_token_or_phone" }));
  process.exit(2);
}

const before = new Date().toISOString();
const body = `ValueOR booking phase verify ${new Date().toISOString()}`;

const postRes = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    to: testRecipient,
    type: "text",
    text: { body },
  }),
});

const postBody = await postRes.json();
const wamid = postBody.messages?.[0]?.id ?? null;

await new Promise((r) => setTimeout(r, 8000));

const { rows: deliveries } = await c.query(
  `select id, delivery_status, error_message, created_at
   from public.channel_delivery_events
   where company_id = $1 and channel_key = 'whatsapp' and created_at >= $2
   order by created_at desc
   limit 5`,
  [companyId, before],
);

console.log(
  JSON.stringify(
    {
      ok: postRes.ok && !postBody.error,
      phoneNumberId,
      postStatus: postRes.status,
      metaError: postBody.error ?? null,
      wamid,
      recentDeliveries: deliveries,
    },
    null,
    2,
  ),
);

await c.end();
process.exit(postRes.ok && !postBody.error ? 0 : 1);
