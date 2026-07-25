/**
 * Find conversations with structured outbound messages for live verification.
 */
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

const { data: outgoing } = await sb
  .from("conversation_messages")
  .select("id, conversation_id, content, metadata, created_at")
  .eq("message_type", "outgoing")
  .not("metadata", "is", null)
  .order("created_at", { ascending: false })
  .limit(200);

const byKind = { buttons: [], list: [], text: [], other: [] };
for (const msg of outgoing ?? []) {
  const kind = msg.metadata?.outboundPayload?.kind;
  if (kind === "buttons") byKind.buttons.push(msg);
  else if (kind === "list") byKind.list.push(msg);
  else if (!kind || kind === "text") byKind.text.push(msg);
  else byKind.other.push({ ...msg, kind });
}

console.log("buttons:", byKind.buttons.length, "list:", byKind.list.length, "text:", byKind.text.length);

const convIds = new Set([
  ...byKind.buttons.map((m) => m.conversation_id),
  ...byKind.list.map((m) => m.conversation_id),
]);

for (const convId of convIds) {
  const { data: conv } = await sb
    .from("conversations")
    .select("id, conversation_number, channel_type, company_id, last_message_at")
    .eq("id", convId)
    .single();

  const kinds = [];
  if (byKind.buttons.some((m) => m.conversation_id === convId)) kinds.push("buttons");
  if (byKind.list.some((m) => m.conversation_id === convId)) kinds.push("list");

  const { data: msgs } = await sb
    .from("conversation_messages")
    .select("id, message_type, content, metadata")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true });

  console.log("\n===", conv?.conversation_number, conv?.channel_type, "===");
  console.log("convId:", convId, "company:", conv?.company_id);
  console.log("structured kinds:", kinds.join(", "));
  console.log("message count:", msgs?.length);
  for (const m of msgs ?? []) {
    const opKind = m.metadata?.outboundPayload?.kind;
    console.log(
      m.message_type,
      opKind ? `[${opKind}]` : "",
      m.content?.slice(0, 50),
    );
  }
}

// CNV-000010 specific
const { data: cnv } = await sb
  .from("conversations")
  .select("id")
  .eq("conversation_number", "CNV-000010")
  .eq("company_channel_id", "e126113b-6d0e-48d3-9296-a46aafe0cc75")
  .maybeSingle();

if (cnv) {
  const { data: msgs } = await sb
    .from("conversation_messages")
    .select("id, message_type, content, metadata")
    .eq("conversation_id", cnv.id)
    .order("created_at", { ascending: true });
  console.log("\n=== CNV-000010 DETAIL ===");
  for (const m of msgs ?? []) {
    console.log(JSON.stringify({
      type: m.message_type,
      kind: m.metadata?.outboundPayload?.kind ?? m.metadata?.kind ?? null,
      content: m.content?.slice(0, 60),
      hasButtons: Boolean(m.metadata?.outboundPayload?.buttons?.length),
      hasSections: Boolean(m.metadata?.outboundPayload?.sections?.length),
    }));
  }
}
