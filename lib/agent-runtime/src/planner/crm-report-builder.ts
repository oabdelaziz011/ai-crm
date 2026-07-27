import type { AgentMemoryState, AgentTaskGraph } from "../types.js";
import { graphProgress } from "../task-graph/task-graph.js";

export type CrmAgentReport = {
  summary: string;
  completedTasks: string[];
  skippedTasks: string[];
  warnings: string[];
  durationMs: number | null;
  referencedDocuments: string[];
  progress: number;
};

export function buildCrmAgentReport(
  graph: AgentTaskGraph,
  memory: AgentMemoryState,
  startedAt?: string | null,
): string {
  const completedTasks: string[] = [];
  const skippedTasks: string[] = [];
  const warnings: string[] = [];
  const referencedDocuments: string[] = [];

  for (const node of graph.nodes) {
    if (node.status === "verified") {
      completedTasks.push(node.title);
    } else if (node.status === "failed" || node.status === "cancelled") {
      skippedTasks.push(`${node.title}${node.error ? `: ${node.error}` : ""}`);
    } else if (node.status === "pending" || node.status === "waiting") {
      skippedTasks.push(`${node.title} (not executed)`);
    }

    if (node.error) warnings.push(node.error);

    const output = memory.toolOutputs[node.id] as Record<string, unknown> | undefined;
    if (output?.requiresConfirmation) {
      warnings.push(String(output.message ?? "Action requires user confirmation."));
    }
    if (output?.contextText && node.tool === "knowledge_search") {
      referencedDocuments.push(String(output.contextText).slice(0, 200));
    }
    if (Array.isArray(output?.results)) {
      for (const item of output.results as Array<{ title?: string }>) {
        if (item.title) referencedDocuments.push(item.title);
      }
    }
  }

  const durationMs =
    startedAt != null ? Math.max(0, Date.now() - new Date(startedAt).getTime()) : null;

  const summary =
    graph.goal.length > 120 ? `${graph.goal.slice(0, 117)}…` : graph.goal;

  const lines = [
    "CRM Agent — Completion Report",
    "═".repeat(32),
    "",
    `Summary: ${summary}`,
    `Agent: Enterprise CRM Agent`,
    `Progress: ${graphProgress(graph)}%`,
    durationMs != null ? `Duration: ${(durationMs / 1000).toFixed(1)}s` : "",
    "",
    "Completed tasks:",
    ...(completedTasks.length ? completedTasks.map((t) => `  ✓ ${t}`) : ["  (none)"]),
    "",
    "Skipped / pending tasks:",
    ...(skippedTasks.length ? skippedTasks.map((t) => `  ○ ${t}`) : ["  (none)"]),
    "",
    "Warnings:",
    ...(warnings.length ? warnings.map((w) => `  ⚠ ${w}`) : ["  (none)"]),
    "",
    "Referenced documents:",
    ...(referencedDocuments.length
      ? [...new Set(referencedDocuments)].slice(0, 5).map((d) => `  • ${d}`)
      : ["  (none)"]),
    "",
    "Follow-up actions:",
    "  • Review results in CRM module",
    "  • Run merge/import again with confirmation if workflow paused",
  ].filter(Boolean);

  return lines.join("\n");
}
