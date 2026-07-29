/**
 * Local webhook POST against built api-server — full exception trace.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";

const root = "D:/ValueOR/project";
const env = {};
for (const line of readFileSync(`${root}/.env`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: ch } = await sb
  .from("company_channels")
  .select("configuration")
  .eq("id", "e126113b-6d0e-48d3-9296-a46aafe0cc75")
  .single();

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
            metadata: { phone_number_id: ch.configuration.phoneNumberId },
            contacts: [{ profile: { name: "Local Full Trace" }, wa_id: "201023169075" }],
            messages: [
              {
                from: "201023169075",
                id: `wamid.${randomUUID()}`,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: "502 local full trace" },
              },
            ],
          },
        },
      ],
    },
  ],
};

const res = await fetch("http://127.0.0.1:3099/api/webhooks/whatsapp", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

console.log("HTTP", res.status, await res.text());

await new Promise((r) => setTimeout(r, 2000));

const { data: evt } = await sb
  .from("channel_inbound_events")
  .select("id,processing_status,error_message,received_at")
  .gte("received_at", before)
  .order("received_at", { ascending: false })
  .limit(1)
  .maybeSingle();

console.log("EVENT", JSON.stringify(evt, null, 2));
