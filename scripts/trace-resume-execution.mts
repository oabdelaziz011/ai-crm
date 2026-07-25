/**
 * Step-by-step resume trace using production graph + inline engine logic.
 * Run: node --import tsx/esm scripts/trace-resume-execution.mts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildResumeInput,
  resetOutboundQueue,
  readOutboundQueue,
  appendOutboundQueueEntry,
  extractInteractiveSelection,
  INTERACTIVE_SELECTION_INPUT_KEY,
  mergeConversationVariables,
  clearLatestOutboundSlot,
  evaluateIfNodeWithDiagnostics,
  resolveNextNodeId,
  findNodeById,
  extractAutomationOutboundMessages,
} from "../lib/automation-platform/src/index.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env: Record<string, string> = {};
for (const p of [resolve(projectRoot, ".env"), resolve(projectRoot, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const RUN_ID = "f627b887-30ce-4c8b-a772-8be95881a49c";
const WAITING_NODE = "991d1d70-7ec1-42e0-8cb5-1516a4f387ad";

type Step = Record<string, unknown>;

function snapQueue(v: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(readOutboundQueue(v)));
}

function executeInteractive(context: {
  variables: Record<string, unknown>;
  input?: Record<string, unknown>;
  node: { id: string; config: Record<string, unknown> };
  action: "send_buttons" | "send_list";
}): { outcome: string; variables: Record<string, unknown>; output?: Record<string, unknown> } {
  const selection = context.input ? extractInteractiveSelection(context.input, { fallbackHint: context.action }) : null;
  if (selection) {
    return {
      outcome: "continue",
      variables: {
        ...context.variables,
        ...mergeConversationVariables(context.variables, selection),
        [INTERACTIVE_SELECTION_INPUT_KEY]: selection.last_button_id ?? selection.last_button_title ?? null,
        __waitingFor: null,
        __prompt: null,
        ...clearLatestOutboundSlot(),
      },
    };
  }
  const text = String(context.node.config.text ?? context.node.config.message ?? "Choose");
  const outbound =
    context.action === "send_list"
      ? { kind: "list", body: text, title: context.node.config.title, buttonLabel: context.node.config.buttonLabel, sections: context.node.config.sections }
      : { kind: "buttons", text, buttons: context.node.config.buttons };
  const queuePatch = appendOutboundQueueEntry(context.variables, outbound as never);
  return {
    outcome: "waiting_input",
    variables: { ...context.variables, ...queuePatch, __waitingFor: INTERACTIVE_SELECTION_INPUT_KEY, __prompt: text },
    output: { waitingFor: INTERACTIVE_SELECTION_INPUT_KEY },
  };
}

function executeCondition(node: { config: Record<string, unknown> }, variables: Record<string, unknown>) {
  const ruleSet = node.config.ruleSet;
  if (ruleSet && typeof ruleSet === "object") {
    const diag = evaluateIfNodeWithDiagnostics(ruleSet as never, variables);
    return { outcome: "continue", variables: { ...variables, __branch: diag.branch }, output: diag, diagnostics: diag };
  }
  return { outcome: "continue", variables, output: {} };
}

function executeSendMessage(node: { config: Record<string, unknown> }, variables: Record<string, unknown>) {
  const message = String(node.config.message ?? node.config.text ?? "");
  const queuePatch = appendOutboundQueueEntry(variables, { kind: "text", text: message });
  return { outcome: "continue", variables: { ...variables, ...queuePatch, __prompt: message } };
}

function traceResume(inbound: { id: string; text: string; replyId?: string; type: string }) {
  const steps: Step[] = [];
  let variables = resetOutboundQueue({
    __waitingFor: "interactive_selection",
    conversation: {},
    __outboundQueue: [
      {
        kind: "buttons",
        text: "please press on what you want",
        buttons: [
          { id: "book", label: "Book Appointment" },
          { id: "pricing", label: "Pricing" },
          { id: "support", label: "Talk to Support" },
        ],
      },
    ],
  });
  // Simulate pre-resume run state at send_buttons
  const resumeInput = buildResumeInput(
    { id: RUN_ID, variables } as never,
    inbound.text,
    inbound.replyId
      ? { kind: "interactive_reply", replyId: inbound.replyId, title: inbound.text, interactionType: inbound.type === "interactive" ? "list_reply" : "button_reply" }
      : {},
  );

  steps.push({
    step: "buildResumeInput",
    file: "lib/automation-platform/src/orchestrator/session-policy.ts",
    line: "158-212",
    input: { inboundText: inbound.text, replyId: inbound.replyId ?? null },
    output: resumeInput,
  });

  // automation-engine.ts resume line 209
  const queueBeforeReset = snapQueue(variables);
  variables = resetOutboundQueue(variables);
  steps.push({
    step: "AutomationEngine.resume → resetOutboundQueue",
    file: "lib/automation-platform/src/engine/automation-engine.ts",
    line: "209",
    __outboundQueue_before: queueBeforeReset,
    __outboundQueue_after: snapQueue(variables),
  });

  let currentNodeId = WAITING_NODE;
  const currentNode = findNodeById(currentNodeId, nodes as never);
  const action = currentNode.config.action as string;

  steps.push({
    step: "handler.execute (waiting node)",
    file: "lib/automation-platform/src/engine/built-in-nodes.ts",
    line: "67-129",
    nodeId: currentNodeId,
    nodeType: currentNode.type,
    nodeAction: action,
    variables_before: { ...variables, __outboundQueue: snapQueue(variables) },
  });

  const interactiveResult = executeInteractive({
    variables,
    input: resumeInput,
    node: currentNode as never,
    action: action as "send_buttons" | "send_list",
  });
  variables = interactiveResult.variables;

  steps.push({
    step: "executeInteractiveMessageAction result",
    file: "lib/automation-platform/src/engine/built-in-nodes.ts",
    line: interactiveResult.outcome === "continue" ? "71-89" : "92-129",
    outcome: interactiveResult.outcome,
    variables_after: { ...variables, __outboundQueue: snapQueue(variables) },
    __outboundQueue_after: snapQueue(variables),
  });

  if (interactiveResult.outcome === "waiting_input") {
    const extracted = extractAutomationOutboundMessages({ lifecycle: "waiting_input", variables });
    return { inbound, steps, finalLifecycle: "waiting_input", outboundCount: extracted.length, extracted, firstEmptyQueueAt: steps.find((s) => (s.__outboundQueue_after as unknown[])?.length === 0) };
  }

  let nextNodeId = resolveNextNodeId(currentNode as never, { edges: edges as never }, variables);
  steps.push({
    step: "resolveNextNodeId after waiting node",
    file: "lib/automation-platform/src/engine/flow-graph.ts",
    line: "150-177",
    nextNodeId,
    note: "action nodes use outgoing[0] when multiple unconditional edges exist",
  });

  while (nextNodeId && steps.length < 25) {
    const node = findNodeById(nextNodeId, nodes as never);
    const qBefore = snapQueue(variables);
    const varsBefore = { ...variables };

    if (node.type === "condition") {
      const r = executeCondition(node as never, variables);
      variables = r.variables;
      nextNodeId = resolveNextNodeId(node as never, { edges: edges as never }, variables);
      steps.push({
        step: "IF node",
        file: "lib/automation-platform/src/engine/built-in-nodes.ts",
        line: "275-294",
        nodeId: node.id,
        label: node.label,
        diagnostics: r.diagnostics,
        __branch: variables.__branch,
        nextNodeId,
        __outboundQueue_before: qBefore,
        __outboundQueue_after: snapQueue(variables),
      });
      continue;
    }

    if (node.config.action === "send_list" || node.config.action === "send_buttons") {
      const r = executeInteractive({ variables, node: node as never, action: node.config.action });
      variables = r.variables;
      steps.push({
        step: node.config.action,
        file: "lib/automation-platform/src/engine/built-in-nodes.ts",
        line: "67-129",
        nodeId: node.id,
        outcome: r.outcome,
        __outboundQueue_before: qBefore,
        __outboundQueue_after: snapQueue(variables),
      });
      if (r.outcome === "waiting_input") break;
      nextNodeId = resolveNextNodeId(node as never, { edges: edges as never }, variables);
      continue;
    }

    if (node.config.action === "send_message") {
      const r = executeSendMessage(node as never, variables);
      variables = r.variables;
      steps.push({
        step: "send_message",
        file: "lib/automation-platform/src/engine/built-in-nodes.ts",
        line: "197-219",
        nodeId: node.id,
        message: node.config.message,
        __outboundQueue_before: qBefore,
        __outboundQueue_after: snapQueue(variables),
      });
      nextNodeId = resolveNextNodeId(node as never, { edges: edges as never }, variables);
      continue;
    }

    if (node.type === "end") {
      steps.push({ step: "end", nodeId: node.id, __outboundQueue: snapQueue(variables) });
      break;
    }

    steps.push({ step: "unhandled", nodeId: node.id, action: node.config.action, type: node.type });
    break;
  }

  const extracted = extractAutomationOutboundMessages({ lifecycle: "waiting_input", variables });
  const firstEmpty = steps.find((s, i) => i > 0 && (s.__outboundQueue_after as unknown[])?.length === 0);
  return {
    inbound,
    steps,
    finalLifecycle: variables.__waitingFor ? "waiting_input" : "completed",
    outboundCount: extracted.length,
    extracted: extracted.map((m) => m.text?.slice(0, 80)),
    finalQueue: snapQueue(variables),
    firstEmptyQueueStep: firstEmpty ?? null,
  };
}

const { data: run } = await sb.from("automation_runs").select("*").eq("id", RUN_ID).single();
const versionId = run.flow_version_id;
const { data: nodes } = await sb.from("automation_flow_version_nodes").select("*").eq("flow_version_id", versionId);
const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", versionId);

const cases = [
  { id: "890374c7", text: "Hello", type: "text" },
  { id: "b34d99d3", text: "Pricing", replyId: "pricing", type: "interactive" },
  { id: "6208c08d", text: "dr3", replyId: "080c0381-1b5e-4bf3-a0e5-f1544b59cf28", type: "interactive" },
  { id: "8bc5b0a2", text: "Hi", type: "text" },
  { id: "ad0b1961", text: "dr3", replyId: "080c0381-1b5e-4bf3-a0e5-f1544b59cf28", type: "interactive" },
];

for (const c of cases) {
  console.log("\n========== TRACE:", c.id, c.text, "==========\n");
  console.log(JSON.stringify(traceResume(c), null, 2));
}
