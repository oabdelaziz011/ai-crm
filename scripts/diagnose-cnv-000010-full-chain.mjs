/**
 * Full CNV-000010 message chain: DB -> parser -> React component mapping.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConversationMessageView } from "../lib/ai-conversation/src/display/parse-conversation-message-view.ts";

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
const CONV_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";

function component(view) {
  switch (view.kind) {
    case "buttons":
      return "ButtonsMessageContent";
    case "list":
      return "ListMessageContent";
    case "text":
      return "TextMessageContent";
    case "interactive_reply":
      return "InteractiveReplyMessageContent";
    default:
      return view.kind;
  }
}

const { data: rows } = await sb
  .from("conversation_messages")
  .select("id, message_type, content, metadata")
  .eq("conversation_id", CONV_ID)
  .order("created_at", { ascending: true });

console.log("=== ALL MESSAGES CNV-000010 ===\n");
for (const row of rows ?? []) {
  const payloadKind = row.metadata?.outboundPayload?.kind ?? null;
  const metadataType = typeof row.metadata;
  const view = parseConversationMessageView(row);
  console.log({
    id: row.id.slice(0, 8),
    message_type: row.message_type,
    content: row.content?.slice(0, 40),
    metadataType,
    outboundPayloadKind: payloadKind,
    parserKind: view.kind,
    component: component(view),
    mismatch: payloadKind && payloadKind !== "text" && view.kind === "text" ? "FALLBACK_TO_TEXT" : null,
  });
}
