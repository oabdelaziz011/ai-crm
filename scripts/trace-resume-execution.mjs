/**
 * Full resume execution trace — pure JS replay of engine path.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

const RUN_ID = "f627b887-30ce-4c8b-a772-8be95881a49c";
const WAITING_NODE = "991d1d70-7ec1-42e0-8cb5-1516a4f387ad";
const INTERACTIVE = "interactive_selection";

function readQueue(v) {
  return Array.isArray(v.__outboundQueue) ? [...v.__outboundQueue] : [];
}

function resetQueue(v) {
  return { ...v, __outboundQueue: [] };
}

function appendQueue(v, entry) {
  const q = [...readQueue(v), entry];
  return { ...v, __outboundQueue: q, __outbound: entry };
}

function readConversation(v) {
  return v.conversation && typeof v.conversation === "object" ? { ...v.conversation } : {};
}

function mergeConversation(v, patch) {
  return { ...v, conversation: { ...readConversation(v), ...patch } };
}

function extractSelection(input, hint) {
  const replyId = typeof input.replyId === "string" ? input.replyId.trim() : "";
  const title = (typeof input.title === "string" ? input.title.trim() : "") || replyId;
  if (!replyId && !title) return null;
  return {
    last_button_id: replyId || title,
    last_button_title: title,
    last_message: title,
    last_selection_type: hint === "send_list" ? "list" : "button",
  };
}

function buildResumeInput(runVars, text, payload) {
  const waitingFor = runVars.__waitingFor ?? "input";
  const input = { ...payload };
  if (waitingFor === INTERACTIVE) {
    if (payload.kind === "interactive_reply" || payload.replyId) {
      input.replyId = payload.replyId;
      input.title = payload.title ?? text;
      input[INTERACTIVE] = payload.replyId?.trim() || input.title;
    }
    const latest = readQueue(runVars).at(-1);
    if (latest?.kind) input.outboundKind = latest.kind;
  } else {
    input[waitingFor] = text;
  }
  const sel = extractSelection(input, latestKind(input.outboundKind));
  if (sel) {
    input.replyId = sel.last_button_id;
    input.title = sel.last_button_title;
  }
  return input;
}

function latestKind(k) {
  if (k === "list") return "send_list";
  if (k === "buttons") return "send_buttons";
  return k;
}

function resolveField(field, vars) {
  if (!field.includes(".")) return vars[field];
  const [ns, key] = field.split(".");
  if (ns === "conversation") return readConversation(vars)[key];
  return vars[field];
}

function evalRule(rule, vars) {
  const actual = resolveField(rule.field, vars);
  if (rule.operator === "equals") return actual === rule.value;
  return false;
}

function evalIfRuleSet(ruleSet, vars) {
  const rules = ruleSet?.root?.rules ?? [];
  const clauses = rules.map((r, i) => ({
    index: i,
    field: r.field,
    operator: r.operator,
    expected: r.value,
    actual: resolveField(r.field, vars),
    matched: evalRule(r, vars),
  }));
  const branch = clauses.every((c) => c.matched) ? "yes" : "no";
  return { branch, clauses };
}

function readConditionBranch(c) {
  return c?.branch ?? c?.branchKey;
}

function resolveNext(node, edges, vars) {
  const out = edges.filter((e) => e.source_node_id === node.id);
  if (!out.length) return null;
  if (node.type === "condition" && node.config?.mode !== "switch") {
    const branch = vars.__branch ?? "no";
    const matched = out.find((e) => readConditionBranch(e.condition) === branch) ?? out.find((e) => !readConditionBranch(e.condition)) ?? out[0];
    return matched?.target_node_id ?? null;
  }
  return out[0]?.target_node_id ?? null;
}

function extractOutboundMessages(vars, lifecycle) {
  const q = readQueue(vars);
  const msgs = q.map((e) => {
    const text = e.kind === "list" ? (e.body || e.title || "") : (e.text || e.body || "");
    return text.trim() ? { text, kind: e.kind } : null;
  }).filter(Boolean);
  if (msgs.length) return msgs;
  if (typeof vars.__prompt === "string" && vars.__prompt.trim()) return [{ text: vars.__prompt.trim(), kind: "prompt" }];
  return [];
}

function nodeInfo(nodes, id) {
  const n = nodes.find((x) => x.id === id);
  return {
    id,
    type: n?.type,
    action: n?.config?.action,
    label: n?.label,
  };
}

function traceOne(inbound, nodes, edges) {
  const steps = [];
  let variables = {
    __waitingFor: INTERACTIVE,
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
  };

  const payload =
    inbound.replyId
      ? { kind: "interactive_reply", replyId: inbound.replyId, title: inbound.text, interactionType: "button_reply" }
      : {};

  const resumeInput = buildResumeInput(variables, inbound.text, payload);
  steps.push({
    fn: "buildResumeInput()",
    file: "lib/automation-platform/src/orchestrator/session-policy.ts",
    lines: "158-212",
    runtime: { waitingFor: INTERACTIVE, inboundText: inbound.text, payload, resumeInput },
  });

  const qBeforeReset = readQueue(variables);
  variables = resetQueue(variables);
  steps.push({
    fn: "AutomationEngine.resume() → resetOutboundQueue()",
    file: "lib/automation-platform/src/engine/automation-engine.ts",
    lines: "209",
    __outboundQueue_before: qBeforeReset,
    __outboundQueue_after: readQueue(variables),
    firstQueueEmptyPoint: qBeforeReset.length > 0 && readQueue(variables).length === 0 ? "line 209 resetOutboundQueue" : null,
  });

  let nodeId = WAITING_NODE;
  let node = nodes.find((n) => n.id === nodeId);
  const action = node.config.action;

  steps.push({
    fn: "handler.execute() on waiting node (NOT executeWaitingNode — does not exist)",
    file: "lib/automation-platform/src/engine/automation-engine.ts",
    lines: "221-222",
    node: nodeInfo(nodes, nodeId),
    nodeInput: resumeInput,
    variables_before: { __outboundQueue: readQueue(variables), __waitingFor: variables.__waitingFor },
  });

  const selection = extractSelection(resumeInput, action);
  let outcome;
  if (selection) {
    variables = mergeConversation(variables, selection);
    variables = { ...variables, [INTERACTIVE]: selection.last_button_id, __waitingFor: null, __prompt: null, __outbound: null };
    outcome = "continue";
    steps.push({
      fn: "executeInteractiveMessageAction() — selection branch",
      file: "lib/automation-platform/src/engine/built-in-nodes.ts",
      lines: "71-89",
      nodeOutput: { outcome: "continue", selection },
      variables_after: { conversation: readConversation(variables), __outboundQueue: readQueue(variables), __waitingFor: variables.__waitingFor },
      __outboundQueue_after: readQueue(variables),
      note: "Queue stays empty; prior outbound cleared at line 209, clearLatestOutboundSlot sets __outbound null",
    });
  } else {
    const outbound = { kind: "buttons", text: node.config.text ?? node.config.message, buttons: node.config.buttons };
    variables = appendQueue(variables, outbound);
    variables = { ...variables, __waitingFor: INTERACTIVE, __prompt: outbound.text };
    outcome = "waiting_input";
    steps.push({
      fn: "executeInteractiveMessageAction() — no selection, re-prompt",
      file: "lib/automation-platform/src/engine/built-in-nodes.ts",
      lines: "92-129",
      nodeOutput: { outcome: "waiting_input", outbound },
      __outboundQueue_after: readQueue(variables),
    });
    const extracted = extractOutboundMessages(variables, "waiting_input");
    return { inbound, steps, lifecycle: "waiting_input", outboundCount: extracted.length, outboundMessages: extracted, firstEmptyQueueAt: steps[1].firstQueueEmptyPoint };
  }

  if (outcome === "continue") {
    let nextId = resolveNext(node, edges, variables);
    steps.push({
      fn: "resolveNextNodeId() after waiting node",
      file: "lib/automation-platform/src/engine/flow-graph.ts",
      lines: "150-177 (action: outgoing[0])",
      runtime: {
        outgoingTargets: edges.filter((e) => e.source_node_id === nodeId).map((e) => nodeInfo(nodes, e.target_node_id)),
        selectedNext: nodeInfo(nodes, nextId),
        reason: "send_buttons has 2 unconditional edges; resolveNextNodeId returns edges[0] only → d4a5623d (Pricing IF)",
      },
    });

    while (nextId && steps.length < 30) {
      node = nodes.find((n) => n.id === nextId);
      const qb = readQueue(variables);
      const vb = JSON.parse(JSON.stringify({ ...variables, __outboundQueue: qb }));

      if (node.type === "condition") {
        const { branch, clauses } = evalIfRuleSet(node.config.ruleSet, variables);
        variables = { ...variables, __branch: branch };
        const diag = { branch, clauses };
        const nextAfter = resolveNext(node, edges, variables);
        steps.push({
          fn: "conditionNodeHandler.execute() + IF edge selection",
          file: "lib/automation-platform/src/engine/built-in-nodes.ts + flow-graph.ts",
          lines: "286-294, 169-174",
          node: nodeInfo(nodes, node.id),
          nodeInput: { variables_snapshot: readConversation(variables) },
          nodeOutput: diag,
          edgeSelection: {
            requestedBranch: branch,
            yesTarget: edges.find((e) => e.source_node_id === node.id && e.condition?.branch === "yes")?.target_node_id,
            noTarget: edges.find((e) => e.source_node_id === node.id && e.condition?.branch === "no")?.target_node_id,
            selected: nextAfter,
          },
          variables_before: vb,
          variables_after: { ...variables, __outboundQueue: readQueue(variables) },
          __outboundQueue_before: qb,
          __outboundQueue_after: readQueue(variables),
        });
        nextId = nextAfter;
        continue;
      }

      if (node.config.action === "send_list") {
        const outbound = {
          kind: "list",
          body: node.config.body,
          title: node.config.title,
          buttonLabel: node.config.buttonLabel,
          sections: node.config.sections,
        };
        variables = appendQueue(variables, outbound);
        variables = { ...variables, __waitingFor: INTERACTIVE, __prompt: node.config.body };
        steps.push({
          fn: "executeInteractiveMessageAction() send_list",
          file: "lib/automation-platform/src/engine/built-in-nodes.ts",
          lines: "104-129",
          node: nodeInfo(nodes, node.id),
          __outboundQueue_before: qb,
          __outboundQueue_after: readQueue(variables),
          nodeOutput: { outcome: "waiting_input", outboundPreview: outbound.body },
        });
        break;
      }

      if (node.config.action === "send_message") {
        const msg = node.config.message ?? node.config.text;
        variables = appendQueue(variables, { kind: "text", text: msg });
        steps.push({
          fn: "send_message action",
          file: "lib/automation-platform/src/engine/built-in-nodes.ts",
          lines: "197-219",
          node: nodeInfo(nodes, node.id),
          __outboundQueue_before: qb,
          __outboundQueue_after: readQueue(variables),
          nodeOutput: { text: msg },
        });
        nextId = resolveNext(node, edges, variables);
        continue;
      }

      if (node.config.action === "return_to_main_menu") {
        steps.push({ fn: "return_to_main_menu", node: nodeInfo(nodes, node.id), lines: "233-239" });
        break;
      }

      if (node.type === "end") {
        steps.push({ fn: "endNodeHandler", node: nodeInfo(nodes, node.id), lines: "339-345", __outboundQueue: readQueue(variables) });
        break;
      }

      steps.push({ fn: "unhandled", node: nodeInfo(nodes, node.id) });
      break;
    }
  }

  const lifecycle = variables.__waitingFor ? "waiting_input" : "completed";
  const outboundMessages = extractOutboundMessages(variables, lifecycle);
  steps.push({
    fn: "extractAutomationOutboundMessages()",
    file: "lib/channel-platform/src/services/extract-automation-outbound.ts",
    lines: "112-139",
    runtime: { lifecycle, queueLength: readQueue(variables).length, queue: readQueue(variables) },
    outputCount: outboundMessages.length,
    outputMessages: outboundMessages,
  });

  return {
    inbound,
    lifecycle,
    outboundCount: outboundMessages.length,
    outboundMessages,
    firstEmptyQueueAt: "automation-engine.ts:209 resetOutboundQueue(run.variables)",
    steps,
  };
}

const { data: run } = await sb.from("automation_runs").select("*").eq("id", RUN_ID).single();
const { data: nodes } = await sb.from("automation_flow_version_nodes").select("*").eq("flow_version_id", run.flow_version_id);
const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", run.flow_version_id);

const { data: inboundRows } = await sb
  .from("channel_inbound_events")
  .select("*")
  .in("id", [
    "890374c7-e0a4-4546-bc22-ed9a7d7de0a0",
    "b34d99d3-cb21-4a88-89be-dd55e63addcc",
    "6208c08d-e7df-45e1-b15e-2dd8cd1603c8",
    "8bc5b0a2-4dfb-4e9d-8d07-aad685d9fa10",
    "ad0b1961-31a2-46a2-9268-905cff261ec0",
  ])
  .order("created_at", { ascending: true });

const cases = inboundRows.map((row) => {
  const msg = row.payload?.message;
  return {
    id: row.id,
    text: msg?.text?.body ?? msg?.interactive?.list_reply?.title ?? msg?.interactive?.button_reply?.title,
    replyId: msg?.interactive?.list_reply?.id ?? msg?.interactive?.button_reply?.id,
    type: msg?.type,
  };
});

const report = { generatedAt: new Date().toISOString(), traces: cases.map((c) => traceOne(c, nodes, edges)) };
writeFileSync(resolve(projectRoot, "scripts/resume-execution-trace-report.json"), JSON.stringify(report, null, 2));

for (const t of report.traces) {
  console.log("\n====", t.inbound.id, t.inbound.text, "====");
  console.log("lifecycle:", t.lifecycle, "outboundCount:", t.outboundCount);
  console.log("messages:", t.outboundMessages?.map((m) => m.text?.slice(0, 50)));
  console.log("firstEmptyQueue:", t.firstEmptyQueueAt);
  for (const s of t.steps) {
    console.log(`  [${s.fn}] ${s.file ?? ""}:${s.lines ?? ""}`);
    if (s.nodeOutput?.branch !== undefined) console.log("    IF branch:", s.nodeOutput.branch, "clauses:", JSON.stringify(s.nodeOutput.clauses));
    if (s.__outboundQueue_after) console.log("    queue after:", s.__outboundQueue_after.length, s.__outboundQueue_after.map((x) => x.kind + ":" + (x.text || x.body || "").slice(0, 40)));
  }
}
