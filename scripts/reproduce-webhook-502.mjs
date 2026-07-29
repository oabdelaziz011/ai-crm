/**
 * Reproduce HTTP 502 and capture response + DB error row.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";

const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const { data: ch } = await sb.from("company_channels").select("configuration").eq("id", CHANNEL_ID).single();
const phoneNumberId = ch.configuration.phoneNumberId;

const before = new Date().toISOString();
const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: phoneNumberId },
            contacts: [{ profile: { name: "502 Trace" }, wa_id: "201023169075" }],
            messages: [
              {
                from: "201023169075",
                id: `wamid.${randomUUID()}`,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: "502 trace request at " + before },
              },
            ],
          },
        },
      ],
    },
  ],
};

const url = "https://webhook.valueor.org/api/webhooks/whatsapp";
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

const body = await res.text();
console.log(JSON.stringify({ status: res.status, statusText: res.statusText, body: body.slice(0, 3000) }, null, 2));

await new Promise((r) => setTimeout(r, 3000));

const { data: evt } = await sb
  .from("channel_inbound_events")
  .select("id,processing_status,error_message,received_at,payload")
  .gte("received_at", before)
  .order("received_at", { ascending: false })
  .limit(1)
  .maybeSingle();

console.log("\nINBOUND_EVENT_AFTER_REQUEST:");
console.log(JSON.stringify(evt, null, 2));

const { data: runtime } = await sb
  .from("runtime_executions")
  .select("id,status,error_message,started_at")
  .gte("started_at", before)
  .order("started_at", { ascending: false })
  .limit(3);

console.log("\nRUNTIME_EXECUTIONS_AFTER_REQUEST:");
console.log(JSON.stringify(runtime, null, 2));
