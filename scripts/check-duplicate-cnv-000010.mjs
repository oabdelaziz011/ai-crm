import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const p of [resolve(projectRoot, ".env"), resolve(projectRoot, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: convs } = await sb
  .from("conversations")
  .select("id, conversation_number, company_id, company_channel_id, channel_type, created_at")
  .eq("conversation_number", "CNV-000010");

console.log("CNV-000010 rows:", convs?.length);
for (const conv of convs ?? []) {
  const { data: msgs } = await sb
    .from("conversation_messages")
    .select("id, message_type, content, metadata")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true });

  const outgoing = (msgs ?? []).filter((m) => m.message_type === "outgoing");
  const structured = outgoing.filter((m) => ["buttons", "list"].includes(m.metadata?.outboundPayload?.kind));
  console.log("\nconv", conv.id, "channel", conv.company_channel_id, "company", conv.company_id);
  console.log("messages", msgs?.length, "outgoing", outgoing.length, "structured", structured.length);
  for (const m of structured) {
    console.log(" ", m.metadata.outboundPayload.kind, m.content?.slice(0, 40));
  }
}
