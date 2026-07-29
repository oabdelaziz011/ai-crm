/**
 * Local webhook reproduction — captures full exception stack from api-server handler.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import express from "../artifacts/api-server/node_modules/express/index.js";
import webhooksRouter from "../artifacts/api-server/src/routes/webhooks.ts";

const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
process.env.SUPABASE_URL ??= env.SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY ??= env.SUPABASE_SERVICE_ROLE_KEY;
process.env.WEBHOOK_EXECUTE_AI ??= "true";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/api/webhooks", webhooksRouter);

const server = app.listen(0, async () => {
  const port = server.address().port;
  const { createClient } = await import(
    "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs"
  );
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: ch } = await sb
    .from("company_channels")
    .select("configuration")
    .eq("id", "e126113b-6d0e-48d3-9296-a46aafe0cc75")
    .single();

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
              contacts: [{ profile: { name: "Local 502 Trace" }, wa_id: "201023169075" }],
              messages: [
                {
                  from: "201023169075",
                  id: `wamid.${randomUUID()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "local webhook 502 trace" },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    console.log(JSON.stringify({ status: res.status, body: body.slice(0, 5000) }, null, 2));
  } catch (error) {
    console.error("FETCH_ERROR", error);
  } finally {
    server.close();
    process.exit(0);
  }
});
