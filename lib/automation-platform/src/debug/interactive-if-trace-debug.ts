import type { CompiledRuleSet, RuleClause, RuleGroup } from "../logic/types.js";
import { evaluateRuleClause, resolveFieldValue } from "../logic/expression-engine.js";
import { evaluateIfElseCondition } from "../logic/condition-evaluator.js";
import { readConversationVariables } from "../runtime/conversation-variables.js";
import { INTERACTIVE_SELECTION_INPUT_KEY } from "../runtime/conversation-variables.js";

export type InteractiveIfTraceStage =
  | "raw_webhook_payload"
  | "parsed_inbound_message"
  | "build_resume_input_output"
  | "engine_resume_input"
  | "list_selection_applied"
  | "if_node_evaluation"
  | "if_branch_result";

export type InteractiveIfTraceLog = {
  event: "automation.interactive_if_trace";
  stage: InteractiveIfTraceStage;
  runId?: string;
  sessionId?: string;
  nodeId?: string;
  [key: string]: unknown;
};

import { readClientEnvFlag } from "@workspace/platform-crypto/client";

export function isInteractiveIfTraceEnabled(): boolean {
  return readClientEnvFlag("AUTOMATION_IF_TRACE_DEBUG");
}

export function logInteractiveIfTrace(payload: InteractiveIfTraceLog): void {
  if (!isInteractiveIfTraceEnabled()) return;
  console.info(JSON.stringify(payload));
}

function isRuleGroup(entry: RuleClause | RuleGroup): entry is RuleGroup {
  return "combinator" in entry && Array.isArray(entry.rules);
}

function collectClauseDiagnostics(
  ruleSet: CompiledRuleSet,
  variables: Record<string, unknown>,
): Array<{
  field: string;
  operator: string;
  expectedValue: unknown;
  actualValue: unknown;
  matched: boolean;
}> {
  const rows: Array<{
    field: string;
    operator: string;
    expectedValue: unknown;
    actualValue: unknown;
    matched: boolean;
  }> = [];

  const walk = (group: RuleGroup) => {
    for (const entry of group.rules) {
      if (isRuleGroup(entry)) {
        walk(entry);
        continue;
      }
      rows.push({
        field: entry.field,
        operator: entry.operator,
        expectedValue: entry.value,
        actualValue: resolveFieldValue(entry.field, variables),
        matched: evaluateRuleClause(entry, { variables }),
      });
    }
  };

  walk(ruleSet.root);
  return rows;
}

export function traceIfNodeEvaluation(input: {
  runId?: string;
  sessionId?: string;
  nodeId: string;
  nodeLabel?: string;
  ruleSet: CompiledRuleSet;
  variables: Record<string, unknown>;
}): { branch: "yes" | "no"; reason: string } {
  const conversation = readConversationVariables(input.variables);
  const clauseDiagnostics = collectClauseDiagnostics(input.ruleSet, input.variables);

  logInteractiveIfTrace({
    event: "automation.interactive_if_trace",
    stage: "if_node_evaluation",
    runId: input.runId,
    sessionId: input.sessionId,
    nodeId: input.nodeId,
    nodeLabel: input.nodeLabel,
    conversation,
    interactive_selection: input.variables[INTERACTIVE_SELECTION_INPUT_KEY] ?? null,
    inputVariable: input.variables.input ?? null,
    clauseDiagnostics,
    variablesSnapshot: {
      __waitingFor: input.variables.__waitingFor ?? null,
      __branch: input.variables.__branch ?? null,
    },
  });

  const branch = evaluateIfElseCondition(input.ruleSet, { variables: input.variables });
  const failedClauses = clauseDiagnostics.filter((row) => !row.matched);
  const reason =
    branch === "yes"
      ? "All rule clauses matched (AND) or at least one group branch matched."
      : failedClauses.length > 0
        ? `No matching branch: ${failedClauses
            .map(
              (row) =>
                `${row.field} ${row.operator} ${JSON.stringify(row.expectedValue)} (actual: ${JSON.stringify(row.actualValue)})`,
            )
            .join("; ")}`
        : "Rule group evaluated to false.";

  logInteractiveIfTrace({
    event: "automation.interactive_if_trace",
    stage: "if_branch_result",
    runId: input.runId,
    sessionId: input.sessionId,
    nodeId: input.nodeId,
    nodeLabel: input.nodeLabel,
    branch: branch.toUpperCase(),
    reason,
    matchedBranch: branch,
  });

  return { branch, reason };
}

export function traceBuildResumeInput(input: {
  runId: string;
  waitingFor: string;
  inboundText: string;
  payload: Record<string, unknown>;
  output: Record<string, unknown>;
}): void {
  logInteractiveIfTrace({
    event: "automation.interactive_if_trace",
    stage: "build_resume_input_output",
    runId: input.runId,
    waitingFor: input.waitingFor,
    inboundText: input.inboundText,
    payload: {
      kind: input.payload.kind ?? null,
      replyId: input.payload.replyId ?? null,
      title: input.payload.title ?? null,
      interactionType: input.payload.interactionType ?? null,
      outboundKind: input.payload.outboundKind ?? null,
    },
    output: {
      replyId: input.output.replyId ?? null,
      title: input.output.title ?? null,
      interactionType: input.output.interactionType ?? null,
      outboundKind: input.output.outboundKind ?? null,
      interactive_selection: input.output[INTERACTIVE_SELECTION_INPUT_KEY] ?? null,
      input: input.output.input ?? null,
    },
  });
}

export function traceEngineResumeInput(input: {
  runId: string;
  sessionId: string;
  resumeInput: Record<string, unknown>;
}): void {
  logInteractiveIfTrace({
    event: "automation.interactive_if_trace",
    stage: "engine_resume_input",
    runId: input.runId,
    sessionId: input.sessionId,
    resumeInput: input.resumeInput,
  });
}

export function traceListSelectionApplied(input: {
  runId?: string;
  sessionId?: string;
  nodeId: string;
  selection: {
    last_button_id?: string;
    last_button_title?: string;
    last_selection_type?: string;
  };
  variables: Record<string, unknown>;
}): void {
  logInteractiveIfTrace({
    event: "automation.interactive_if_trace",
    stage: "list_selection_applied",
    runId: input.runId,
    sessionId: input.sessionId,
    nodeId: input.nodeId,
    selection: input.selection,
    conversation: readConversationVariables(input.variables),
    interactive_selection: input.variables[INTERACTIVE_SELECTION_INPUT_KEY] ?? null,
  });
}

export function traceParsedInboundMessage(input: {
  channelKey: string;
  externalUserId: string;
  text: string;
  metadata: Record<string, unknown>;
  rawWebhookSummary?: Record<string, unknown>;
}): void {
  if (input.rawWebhookSummary) {
    logInteractiveIfTrace({
      event: "automation.interactive_if_trace",
      stage: "raw_webhook_payload",
      rawWebhookSummary: input.rawWebhookSummary,
    });
  }

  logInteractiveIfTrace({
    event: "automation.interactive_if_trace",
    stage: "parsed_inbound_message",
    channelKey: input.channelKey,
    externalUserId: input.externalUserId,
    text: input.text,
    replyId: input.metadata.replyId ?? null,
    title: input.metadata.title ?? null,
    kind: input.metadata.kind ?? null,
    interactionType: input.metadata.interactionType ?? null,
    whatsappMessageType: input.metadata.whatsappMessageType ?? null,
  });
}
