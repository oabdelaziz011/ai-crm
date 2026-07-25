/**
 * Steps 6-10: parser + React switch branch for live CNV-000010 rows.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseConversationMessageView } from "../../../lib/ai-conversation/src/display/parse-conversation-message-view.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const env = {};
for (const p of [resolve(projectRoot, ".env"), resolve(projectRoot, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

function reactComponentForView(view) {
  switch (view.kind) {
    case "text":
      return "TextMessageContent";
    case "buttons":
      return "ButtonsMessageContent";
    case "list":
      return "ListMessageContent";
    case "media":
      return "MediaMessageContent";
    case "template":
      return "TemplateMessageContent";
    case "interactive_reply":
      return "InteractiveReplyMessageContent";
    case "unknown":
      return "UnknownMessageContent";
    default:
      return "TextMessageContent (default fallback)";
  }
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CONV_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";

const { data: rows } = await sb
  .from("conversation_messages")
  .select("*")
  .eq("conversation_id", CONV_ID)
  .order("created_at", { ascending: true });

const buttonRow = rows?.find((r) => r.metadata?.outboundPayload?.kind === "buttons");
const listRow = rows?.find((r) => r.metadata?.outboundPayload?.kind === "list");

for (const label of ["BUTTON", "LIST"]) {
  const row = label === "BUTTON" ? buttonRow : listRow;
  const payload = row.metadata?.outboundPayload;
  const view = parseConversationMessageView(row);
  console.log(`\n=== ${label} MESSAGE ===`);
  console.log("row.id:", row.id);
  console.log("outboundPayload exists:", Boolean(payload));
  console.log("outboundPayload.kind:", payload?.kind);
  console.log("ConversationMessageView:", JSON.stringify(view, null, 2));
  console.log("React switch selects:", reactComponentForView(view));
  console.log("Falls back to TextMessageContent?", view.kind === "text" ? "YES" : "NO");
}
