/**
 * Render live DB messages through React components (same code path as running app).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "@supabase/supabase-js";
import { parseConversationMessageView } from "../../../lib/ai-conversation/src/display/parse-conversation-message-view.ts";
import { ConversationMessageBubble } from "../src/components/conversations/messages/conversation-message-bubble.tsx";

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

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CONV_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";

const { data: rows } = await sb
  .from("conversation_messages")
  .select("*")
  .eq("conversation_id", CONV_ID)
  .order("created_at", { ascending: true });

const buttonRow = rows?.find((r) => r.metadata?.outboundPayload?.kind === "buttons");
const listRow = rows?.find((r) => r.metadata?.outboundPayload?.kind === "list");

const outDir = resolve(projectRoot, "artifacts/live-react-render-probe");
mkdirSync(outDir, { recursive: true });

const report = [];

for (const row of [buttonRow, listRow].filter(Boolean)) {
  const view = parseConversationMessageView(row);
  const html = renderToStaticMarkup(React.createElement(ConversationMessageBubble, { message: row }));
  report.push({
    id: row.id,
    content: row.content,
    outboundKind: row.metadata?.outboundPayload?.kind,
    parserView: view,
    reactComponent:
      view.kind === "buttons"
        ? "ButtonsMessageContent"
        : view.kind === "list"
          ? "ListMessageContent"
          : "TextMessageContent",
    domHasButtonChips: html.includes("rounded-full"),
    domHasListSections: (row.metadata?.outboundPayload?.sections?.[0]?.rows ?? []).every((r) => html.includes(r.title)),
    domHasListTrigger: html.includes("View options"),
    html,
  });
}

writeFileSync(resolve(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report.map((r) => ({ ...r, html: r.html.slice(0, 300) })), null, 2));
