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
const whatsappCompany = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const convId = "a35d7fff-cac7-47f3-9604-df683e726b71";
const sessionId = "4c43b25c-84e8-45bb-9ab5-a6297bcaa859";
const at = new Date().toISOString();

console.log("UPDATE conversations.last_message_at", convId, at);
await sb.from("conversations").update({ last_message_at: at, last_message_preview: `[OMNI_RT probe ${at}]` }).eq("id", convId);

console.log("INSERT conversation_messages incoming");
const { data: msg, error: msgErr } = await sb
  .from("conversation_messages")
  .insert({
    conversation_id: convId,
    message_type: "incoming",
    content_type: "text",
    content: `[OMNI_RT probe incoming ${at}]`,
    metadata: { omniRealtimeProbe: true },
    status: "delivered",
  })
  .select("id")
  .single();
console.log("msg", msgErr?.message ?? msg?.id);

console.log("UPDATE channel_sessions.last_inbound_at", sessionId);
await sb.from("channel_sessions").update({ last_inbound_at: at }).eq("id", sessionId);
