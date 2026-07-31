#!/usr/bin/env node
/**
 * Capture WhatsApp webhook + workflow execution traces to tmp/whatsapp-workflow-trace.log
 *
 * Usage:
 *   node scripts/capture-whatsapp-workflow-trace.mjs
 *
 * Then send a WhatsApp message to the configured number. Press Ctrl+C when done.
 *
 * Filter after capture:
 *   node scripts/filter-whatsapp-workflow-trace.mjs --timeline
 *   AUTOMATION_WORKFLOW_TRACE_DEBUG=1  — master switch for workflow/node/IF/list traces
 *   WEBHOOK_STACK_DEBUG=1              — webhook stack spawn diagnostics
 *   LOG_LEVEL=info                     — pino level (use debug for more HTTP noise)
 */
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logPath = resolve(root, "tmp/whatsapp-workflow-trace.log");
const logStream = createWriteStream(logPath, { flags: "a" });

const traceEnv = {
  ...process.env,
  AUTOMATION_WORKFLOW_TRACE_DEBUG: "1",
  AUTOMATION_IF_TRACE_DEBUG: "1",
  AUTOMATION_LIST_NODE_DEBUG: "1",
  AUTOMATION_INBOUND_ROUTING_DEBUG: "1",
  WEBHOOK_STACK_DEBUG: "1",
  LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
};

const startedAt = new Date().toISOString();
logStream.write(`\n=== WhatsApp workflow trace capture started ${startedAt} ===\n`);

console.log(`Writing traces to ${logPath}`);
console.log("Send a WhatsApp message now, then press Ctrl+C to stop.\n");
console.log("Filter tips:");
console.log('  webhookStep:"webhook.workflow_resolved"');
console.log('  webhookStep:"webhook.automation_started"');
console.log('  event:"automation.workflow_execution_trace"');
console.log('  event:"automation.list_node_lifecycle"');
console.log('  stage:"status_only_callback" (delivery/read — NOT user messages)\n');

const child = spawn("node", ["scripts/cloudflare/start-webhook-stack.mjs"], {
  cwd: root,
  env: traceEnv,
  stdio: ["inherit", "pipe", "pipe"],
  shell: false,
});

function tee(chunk) {
  process.stdout.write(chunk);
  logStream.write(chunk);
}

child.stdout.on("data", tee);
child.stderr.on("data", tee);

function shutdown(code = 0) {
  logStream.write(`\n=== Capture ended ${new Date().toISOString()} exit=${code} ===\n`);
  logStream.end();
  if (!child.killed) child.kill("SIGTERM");
  process.exit(code);
}

child.on("exit", (code) => shutdown(code ?? 0));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
