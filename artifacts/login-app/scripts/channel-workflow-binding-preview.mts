/**
 * Renders ChannelWorkflowBindingSection to an HTML preview file.
 * Run: npm run preview:channel-workflow-binding
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { I18nextProvider } from "react-i18next";
import { ChannelWorkflowBindingSection } from "../src/components/channels/channel-workflow-binding-section";
import i18n from "../src/i18n";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../../../docs/operations/sprint-w2-screenshots");
mkdirSync(outDir, { recursive: true });

const win = new Window({ url: "http://localhost/dashboard/channels" });
(globalThis as { window?: Window; document?: Document }).window = win;
(globalThis as { window?: Document }).document = win.document;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rootEl = win.document.createElement("div");
rootEl.style.cssText = "padding:24px;background:#0b0f19;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;max-width:520px;";
win.document.body.appendChild(rootEl);

const heading = win.document.createElement("h2");
heading.textContent = "Configure — WhatsApp Channel";
heading.style.cssText = "font-size:18px;font-weight:600;margin:0 0 16px;";
rootEl.insertBefore(heading, rootEl.firstChild);

const root = createRoot(rootEl);

await act(async () => {
  root.render(
    React.createElement(
      I18nextProvider,
      { i18n },
      React.createElement(ChannelWorkflowBindingSection, {
        workflowEnabled: true,
        onWorkflowEnabledChange: () => {},
        selectedFlowId: "flow-1",
        onSelectedFlowIdChange: () => {},
        flows: [
          { id: "flow-1", name: "Welcome Flow" },
          { id: "flow-2", name: "Support Flow" },
        ],
      }),
    ),
  );
});
await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Sprint W2 — Channel Workflow Binding Preview</title>
  <style>
    body { margin: 0; background: #0b0f19; }
  </style>
</head>
<body>${win.document.body.innerHTML}</body>
</html>`;

const outPath = resolve(outDir, "automation-workflow-section-preview.html");
writeFileSync(outPath, html, "utf8");
console.log(`Preview written: ${outPath}`);
