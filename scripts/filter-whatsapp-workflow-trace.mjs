#!/usr/bin/env node
/**
 * Extract workflow-relevant trace lines from tmp/whatsapp-workflow-trace.log
 *
 * Usage:
 *   node scripts/filter-whatsapp-workflow-trace.mjs [logPath]
 *   node scripts/filter-whatsapp-workflow-trace.mjs --timeline
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const timeline = args.includes("--timeline");
const logPath = resolve(root, args.find((a) => !a.startsWith("-")) ?? "tmp/whatsapp-workflow-trace.log");

if (!existsSync(logPath)) {
  console.error(`Log not found: ${logPath}`);
  console.error("Run: node scripts/capture-whatsapp-workflow-trace.mjs");
  process.exit(1);
}

const raw = readFileSync(logPath, "utf8");
const lines = raw.split(/\r?\n/);

const KEEP = [
  "webhookStep",
  "automation.workflow_execution_trace",
  "automation.if_node_trace",
  "automation.interactive_if_trace",
  "automation.list_node_lifecycle",
  "automation.inbound_routing_trace",
  "status_only_callback",
];

const parsed = [];
for (const line of lines) {
  if (!line.trim() || line.startsWith("===")) continue;
  const jsonStart = line.indexOf("{");
  if (jsonStart < 0) continue;
  try {
    const obj = JSON.parse(line.slice(jsonStart));
    const hit =
      obj.webhookStep ||
      obj.event?.startsWith("automation.") ||
      obj.stage === "status_only_callback";
    if (!hit) continue;
    parsed.push({ line, obj });
  } catch {
    /* non-JSON log line */
  }
}

const inbound = parsed.filter(
  (p) =>
    p.obj.webhookStep &&
    !["webhook.diag", "webhook.diag_early_return"].includes(p.obj.webhookStep) &&
    p.obj.stage !== "status_only_callback",
);

const statusOnly = parsed.filter((p) => p.obj.stage === "status_only_callback");

console.log(`Log: ${logPath}`);
console.log(`Total trace events: ${parsed.length} (${inbound.length} workflow, ${statusOnly.length} status-only)\n`);

if (statusOnly.length > 0 && inbound.length === 0) {
  console.warn(
    "WARNING: Log contains only delivery/read status callbacks — no inbound user message was captured.\n" +
      "Send a fresh WhatsApp text message while capture is running.\n",
  );
}

if (timeline) {
  for (const { obj } of inbound) {
    const ts = obj.time ?? obj.timestamp ?? "";
    if (obj.webhookStep) {
      console.log(`${ts}\t${obj.webhookStep}\t${JSON.stringify({ ...obj, time: undefined, msg: undefined })}`);
    } else     if (obj.event === "automation.workflow_execution_trace") {
      if (obj.stage === "execution_identity") {
        console.log(
          `${ts}\texecution_identity\tv${obj.publishedVersionNumber}\tstart=${obj.startNodeType}/${obj.startNodeAction ?? ""}\tdraft=${obj.hasUnpublishedDraft}`,
        );
      } else if (obj.stage === "executed_node_trail") {
        for (const node of obj.firstFiveExecutedNodes ?? []) {
          console.log(`${ts}\texec#${node.sequence}\t${node.type}/${node.action ?? ""}\t${node.messagePreview ?? node.label ?? ""}`);
        }
      } else {
        const node = obj.node ?? obj.fromNode ?? {};
        console.log(
          `${ts}\t${obj.stage}\t${node.action ?? node.type ?? ""}\t${node.messagePreview ?? node.label ?? ""}`,
        );
      }
    } else if (obj.event === "automation.if_node_trace") {
      console.log(`${ts}\tif\t${obj.stage}\tbranch=${obj.branch ?? obj.requestedBranch ?? "?"}`);
    } else {
      console.log(`${ts}\t${obj.event}\t${obj.stage ?? ""}`);
    }
  }
  process.exit(0);
}

for (const { line } of inbound) {
  console.log(line);
}
