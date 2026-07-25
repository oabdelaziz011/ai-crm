/**
 * Live DB + parser diagnosis for CNV-000010 structured messages.
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
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";

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

const { data: conv } = await sb
  .from("conversations")
  .select("id, conversation_number, company_id, channel_type")
  .eq("conversation_number", "CNV-000010")
  .eq("company_channel_id", CHANNEL_ID)
  .maybeSingle();

if (!conv) {
  console.error("CNV-000010 not found");
  process.exit(1);
}

console.log("=== CONVERSATION ===");
console.log(JSON.stringify(conv, null, 2));

const { data: rows, error } = await sb
  .from("conversation_messages")
  .select("*")
  .eq("conversation_id", conv.id)
  .order("created_at", { ascending: true });

if (error) throw error;

const structured = (rows ?? []).filter((r) => {
  const kind = r.metadata?.outboundPayload?.kind;
  return kind === "buttons" || kind === "list";
});

console.log("\n=== STRUCTURED OUTBOUND ROWS (buttons|list) ===");
console.log("count:", structured.length);

const buttonRow = structured.find((r) => r.metadata?.outboundPayload?.kind === "buttons");
const listRow = structured.find((r) => r.metadata?.outboundPayload?.kind === "list");

for (const row of [buttonRow, listRow].filter(Boolean)) {
  const payload = row.metadata?.outboundPayload;
  console.log("\n--- MESSAGE ROW ---");
  console.log("id:", row.id);
  console.log("message_type:", row.message_type);
  console.log("content:", row.content);
  console.log("created_at:", row.created_at);
  console.log("\nfull metadata JSON:");
  console.log(JSON.stringify(row.metadata, null, 2));
  console.log("\noutboundPayload exists:", Boolean(payload));
  console.log("outboundPayload.kind:", payload?.kind ?? null);

  const view = parseConversationMessageView(row);
  console.log("\nparseConversationMessageView() output:");
  console.log(JSON.stringify(view, null, 2));
  console.log("React component selected:", reactComponentForView(view));

  if (payload?.kind === "buttons" && view.kind !== "buttons") {
    console.log("FALLBACK REASON (buttons):", diagnoseButtonsFallback(payload, row.content));
  }
  if (payload?.kind === "list" && view.kind !== "list") {
    console.log("FALLBACK REASON (list):", diagnoseListFallback(payload, row.content));
  }
}

function diagnoseButtonsFallback(payload, fallbackText) {
  const reasons = [];
  if (payload.kind !== "buttons") reasons.push(`kind is '${payload.kind}' not 'buttons'`);
  const text = typeof payload.text === "string" && payload.text.trim() ? payload.text.trim() : fallbackText;
  if (!text) reasons.push("missing text");
  const buttons = Array.isArray(payload.buttons) ? payload.buttons : [];
  const valid = buttons.filter((b) => b?.id && b?.label);
  if (valid.length === 0) reasons.push(`buttons array empty or invalid (${buttons.length} entries)`);
  if (reasons.length === 0) reasons.push("unknown — parser should have matched");
  return reasons.join("; ");
}

function diagnoseListFallback(payload, fallbackText) {
  const reasons = [];
  if (payload.kind !== "list") reasons.push(`kind is '${payload.kind}' not 'list'`);
  const body = typeof payload.body === "string" && payload.body.trim() ? payload.body.trim() : fallbackText;
  if (!body) reasons.push("missing body");
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  const rowCount = sections.reduce((n, s) => n + (Array.isArray(s?.rows) ? s.rows.length : 0), 0);
  if (rowCount === 0) reasons.push(`sections empty or invalid (${sections.length} sections)`);
  if (reasons.length === 0) reasons.push("unknown — parser should have matched");
  return reasons.join("; ");
}
