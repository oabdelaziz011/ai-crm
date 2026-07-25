/**
 * Static HTML preview for Phase 2a message rendering evidence.
 * Run: node scripts/render-message-preview-evidence.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConversationMessageView } from "../lib/ai-conversation/src/display/parse-conversation-message-view.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../artifacts/message-preview-evidence");
mkdirSync(outDir, { recursive: true });

function baseMessage(overrides) {
  return {
    id: "msg-preview",
    conversation_id: "conv-preview",
    participant_id: null,
    sequence_number: 1,
    message_type: "outgoing",
    content_type: "text",
    content: "",
    metadata: {},
    status: "sent",
    external_message_id: null,
    attachment_type: null,
    attachment_url: null,
    mime_type: null,
    file_size: null,
    search_text: "",
    created_at: "2026-07-24T18:12:51.443385+00:00",
    created_by: null,
    ...overrides,
  };
}

const samples = [
  {
    name: "text",
    message: baseMessage({ content: "اهلا بيك يا فندم اقدر اساعد حضرتك اذاي؟" }),
  },
  {
    name: "buttons",
    message: baseMessage({
      content: "please press on what you want",
      metadata: {
        outboundPayload: {
          kind: "buttons",
          text: "please press on what you want",
          buttons: [
            { id: "book", label: "Book Appointment" },
            { id: "pricing", label: "Pricing" },
            { id: "support", label: "Talk to Support" },
          ],
        },
      },
    }),
  },
  {
    name: "list",
    message: baseMessage({
      content: "Pick the option that fits you best.",
      metadata: {
        outboundPayload: {
          kind: "list",
          title: "Choose a doctor",
          body: "Pick the option that fits you best.",
          buttonLabel: "View options",
          sections: [
            {
              title: "Options",
              rows: [
                { id: "dr1", title: "dr1", description: "General" },
                { id: "dr3", title: "dr3", description: "Specialist · $3000" },
              ],
            },
          ],
        },
      },
    }),
  },
];

function renderButtons(view) {
  const chips = view.buttons
    .map(
      (b) =>
        `<span class="chip" title="${b.id}">${b.label}</span>`,
    )
    .join("");
  return `<p class="body">${view.text}</p><div class="chips">${chips}</div>`;
}

function renderList(view) {
  const rows = view.sections
    .flatMap((section) =>
      section.rows.map(
        (row) =>
          `<div class="row"><div class="row-title">${row.title}</div>${row.description ? `<div class="row-desc">${row.description}</div>` : ""}</div>`,
      ),
    )
    .join("");
  const sections = view.sections
    .map(
      (section) =>
        `<div class="section"><div class="section-title">${section.title}</div>${section.rows
          .map(
            (row) =>
              `<div class="row"><div class="row-title">${row.title}</div>${row.description ? `<div class="row-desc">${row.description}</div>` : ""}</div>`,
          )
          .join("")}</div>`,
    )
    .join("");
  return `<div class="list-title">${view.title}</div><p class="body">${view.body}</p><div class="list-trigger">${view.buttonLabel}</div>${sections}`;
}

function renderView(view) {
  switch (view.kind) {
    case "text":
      return `<p class="body">${view.text}</p>`;
    case "buttons":
      return renderButtons(view);
    case "list":
      return renderList(view);
    default:
      return `<p class="body">${view.text ?? ""}</p>`;
  }
}

const cards = samples
  .map(({ name, message }) => {
    const view = parseConversationMessageView(message);
    return `<section class="card"><h2>${name}</h2><div class="bubble">${renderView(view)}</div><pre>${JSON.stringify(view, null, 2)}</pre></section>`;
  })
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Phase 2a Message Preview Evidence</title>
  <style>
    body { font-family: Inter, Segoe UI, sans-serif; background: #0b0f17; color: #e5e7eb; padding: 24px; }
    h1 { margin-bottom: 8px; }
    .grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
    .card { background: #111827; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; padding: 16px; }
    .bubble { background: rgba(59,130,246,.15); border: 1px solid rgba(59,130,246,.25); border-radius: 12px; padding: 12px; margin: 12px 0; max-width: 360px; }
    .body { white-space: pre-wrap; margin: 0 0 8px; font-size: 14px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { border: 1px solid rgba(255,255,255,.15); background: rgba(0,0,0,.2); border-radius: 999px; padding: 4px 10px; font-size: 12px; color: #9ca3af; }
    .list-title { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #9ca3af; margin-bottom: 6px; }
    .list-trigger { display: inline-block; border: 1px solid rgba(255,255,255,.15); background: rgba(0,0,0,.2); border-radius: 8px; padding: 6px 10px; font-size: 12px; color: #9ca3af; margin: 8px 0; }
    .section { border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.1); border-radius: 8px; padding: 8px; margin-top: 8px; }
    .section-title { font-size: 11px; color: #9ca3af; margin-bottom: 6px; }
    .row { border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.2); border-radius: 6px; padding: 6px 8px; margin-top: 4px; }
    .row-title { font-size: 12px; font-weight: 600; }
    .row-desc { font-size: 11px; color: #9ca3af; margin-top: 2px; }
    pre { font-size: 11px; overflow: auto; background: rgba(0,0,0,.25); padding: 10px; border-radius: 8px; color: #cbd5e1; }
  </style>
</head>
<body>
  <h1>Phase 2a — Conversation Message Rendering Evidence</h1>
  <p>Generated from parseConversationMessageView() using production payload shapes.</p>
  <div class="grid">${cards}</div>
</body>
</html>`;

const outFile = resolve(outDir, "index.html");
writeFileSync(outFile, html, "utf8");
console.log("Wrote", outFile);
