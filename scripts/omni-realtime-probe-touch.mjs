import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Browser MCP session company
const browserCompany = "d0000010-0001-4001-8001-000000000002";
const whatsappCompany = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const convWhatsApp = "a35d7fff-cac7-47f3-9604-df683e726b71";

const { data: topBrowser } = await sb
  .from("conversations")
  .select("id, conversation_number, last_message_at")
  .eq("company_id", browserCompany)
  .is("deleted_at", null)
  .order("last_message_at", { ascending: false, nullsFirst: false })
  .limit(1);

const touchId = topBrowser?.[0]?.id;
const touchAt = new Date().toISOString();
console.log("TOUCH browser company conv", touchId, touchAt);
if (touchId) {
  await sb.from("conversations").update({ updated_at: touchAt }).eq("id", touchId);
}

console.log("TOUCH whatsapp company conv", convWhatsApp, touchAt);
await sb.from("conversations").update({ updated_at: touchAt }).eq("id", convWhatsApp);

const { data: latestInbound } = await sb
  .from("channel_inbound_events")
  .select("id, created_at, sender_external_id, conversation_id")
  .eq("company_id", whatsappCompany)
  .order("created_at", { ascending: false })
  .limit(3);
console.log("LATEST INBOUND whatsapp company:", JSON.stringify(latestInbound, null, 2));
