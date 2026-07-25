/**
 * Render live DB messages through React components (same code as running app).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { parseConversationMessageView } from "../lib/ai-conversation/src/display/parse-conversation-message-view.ts";
import { ConversationMessageBubble } from "../artifacts/login-app/src/components/conversations/messages/conversation-message-bubble.tsx";

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

const { data: rows } = await sb
  .from("conversation_messages")
  .select("*")
  .eq("conversation_id", CONV_ID)
  .order("created_at", { ascending: true });

const targets = (rows ?? []).filter((r) => ["buttons", "list"].includes(r.metadata?.outboundPayload?.kind));

const outDir = resolve(projectRoot, "artifacts/live-react-render-probe");
mkdirSync(outDir, { recursive: true });

const report = [];

for (const row of targets.slice(0, 4)) {
  const view = parseConversationMessageView(row);
  const html = renderToStaticMarkup(React.createElement(ConversationMessageBubble, { message: row }));
  const hasRoundedFull = html.includes("rounded-full");
  const hasListTree = html.includes("lucide-list-tree") || html.includes("View options");
  const hasSectionRows = (row.metadata?.outboundPayload?.sections?.[0]?.rows ?? []).every((r) =>
    html.includes(r.title),
  );

  report.push({
    id: row.id,
    content: row.content,
    outboundKind: row.metadata?.outboundPayload?.kind,
    parserKind: view.kind,
    component:
      view.kind === "buttons"
        ? "ButtonsMessageContent"
        : view.kind === "list"
          ? "ListMessageContent"
          : "TextMessageContent",
    htmlContainsButtonChips: hasRoundedFull,
    htmlContainsListTrigger: hasListTree,
    htmlContainsAllListRows: view.kind === "list" ? hasSectionRows : null,
    htmlPreview: html.slice(0, 500),
  });

  writeFileSync(resolve(outDir, `${row.id}.html`), `<!doctype html><body>${html}</body>`, "utf8");
}

writeFileSync(resolve(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
