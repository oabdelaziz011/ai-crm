import type { CompiledRuleSet, RuleClause, RuleGroup } from "../logic/types.js";
import { evaluateIfElseCondition } from "../logic/condition-evaluator.js";
import { evaluateRuleClause, resolveFieldValue } from "../logic/expression-engine.js";
import type { AutomationEdgeRecord } from "../types.js";
import {
  diagnoseConditionEdgeResolution,
  type ConditionEdgeResolutionDiagnostic,
} from "../engine/flow-graph.js";
import type { ExecutionContext } from "../engine/execution-context.js";
import { INTERACTIVE_SELECTION_INPUT_KEY, readConversationVariables } from "../runtime/conversation-variables.js";

export type IfNodeClauseDiagnostic = {
  index: number;
  field: string;
  operator: string;
  expectedValue: unknown;
  actualValue: unknown;
  matched: boolean;
};

export type IfNodeEvaluationDiagnostic = {
  branch: "yes" | "no";
  clauses: IfNodeClauseDiagnostic[];
  resolvedFieldValues: Record<string, unknown>;
  matchedRuleIndex: number | null;
  evaluationReason: string;
};

export function isIfNodeTraceEnabled(): boolean {
  return process.env.AUTOMATION_IF_TRACE_DEBUG === "1";
}

function logIfNodeTrace(payload: Record<string, unknown>): void {
  if (!isIfNodeTraceEnabled()) return;
  console.info(JSON.stringify({ event: "automation.if_node_trace", ...payload }));
}

function isRuleGroup(entry: RuleClause | RuleGroup): entry is RuleGroup {
  return "combinator" in entry && Array.isArray(entry.rules);
}

function collectUniqueRuleFields(ruleSet: CompiledRuleSet): string[] {
  const fields = new Set<string>();

  const walk = (group: RuleGroup) => {
    for (const entry of group.rules) {
      if (isRuleGroup(entry)) {
        walk(entry);
        continue;
      }
      if (entry.field?.trim()) fields.add(entry.field.trim());
    }
  };

  walk(ruleSet.root);
  return [...fields];
}

export function evaluateIfNodeWithDiagnostics(
  ruleSet: CompiledRuleSet,
  variables: Record<string, unknown>,
): IfNodeEvaluationDiagnostic {
  const clauses: IfNodeClauseDiagnostic[] = [];
  let index = 0;

  const walk = (group: RuleGroup) => {
    for (const entry of group.rules) {
      if (isRuleGroup(entry)) {
        walk(entry);
        continue;
      }
      clauses.push({
        index,
        field: entry.field,
        operator: entry.operator,
        expectedValue: entry.value,
        actualValue: resolveFieldValue(entry.field, variables),
        matched: evaluateRuleClause(entry, { variables }),
      });
      index += 1;
    }
  };

  walk(ruleSet.root);

  const resolvedFieldValues: Record<string, unknown> = {};
  for (const field of collectUniqueRuleFields(ruleSet)) {
    resolvedFieldValues[field] = resolveFieldValue(field, variables);
  }

  const branch = evaluateIfElseCondition(ruleSet, { variables });
  const firstFailed = clauses.find((clause) => !clause.matched);
  const matchedRuleIndex =
    branch === "yes"
      ? clauses.length > 0
        ? clauses.length - 1
        : null
      : (firstFailed?.index ?? null);

  const evaluationReason =
    branch === "yes"
      ? clauses.length > 0
        ? "All configured rule clauses matched."
        : "Empty rule set evaluated to true."
      : firstFailed
        ? `Clause ${firstFailed.index} failed: ${firstFailed.field} ${firstFailed.operator} ${JSON.stringify(firstFailed.expectedValue)} (actual: ${JSON.stringify(firstFailed.actualValue)})`
        : "Rule set evaluated to false.";

  return {
    branch,
    clauses,
    resolvedFieldValues,
    matchedRuleIndex,
    evaluationReason,
  };
}

export function traceIfNodeEntered(context: ExecutionContext): void {
  if (context.currentNode.type !== "condition") return;

  logIfNodeTrace({
    stage: "if_node_entered",
    runId: context.run.id,
    sessionId: context.session.id,
    flowVersionId: context.run.flow_version_id ?? context.session.flow_version_id ?? null,
    nodeId: context.currentNode.id,
    nodeType: context.currentNode.type,
    nodeConfigMode: context.currentNode.config.mode ?? "if_else",
    incomingVariables: context.variables,
    incomingInput: context.input ?? null,
    runtimeGraph: {
      nodeCount: context.nodes.length,
      edgeCount: context.edges.length,
      outgoingEdgeCount: context.edges.filter((edge) => edge.source_node_id === context.currentNode.id).length,
    },
  });
}

export function traceIfNodeEvaluation(input: {
  context: ExecutionContext;
  evaluation: IfNodeEvaluationDiagnostic;
}): void {
  const { context, evaluation } = input;

  logIfNodeTrace({
    stage: "if_node_evaluation",
    runId: context.run.id,
    sessionId: context.session.id,
    flowVersionId: context.run.flow_version_id ?? context.session.flow_version_id ?? null,
    nodeId: context.currentNode.id,
    incomingVariables: context.variables,
    incomingInput: context.input ?? null,
    conversation: readConversationVariables(context.variables),
    interactive_selection: context.variables[INTERACTIVE_SELECTION_INPUT_KEY] ?? null,
    resolvedFieldValues: evaluation.resolvedFieldValues,
    clauses: evaluation.clauses.map(({ index, field, operator, expectedValue, actualValue, matched }) => ({
      field,
      operator,
      expectedValue,
      actualValue,
      matched,
      ruleIndex: index,
    })),
    branch: evaluation.branch,
    matchedRuleIndex: evaluation.matchedRuleIndex,
    evaluationReason: evaluation.evaluationReason,
  });
}

export function traceIfNodeEdgeResolution(input: {
  runId: string;
  sessionId: string;
  flowVersionId: string | null;
  nodeId: string;
  variables: Record<string, unknown>;
  diagnostic: ConditionEdgeResolutionDiagnostic;
  matchedRuleIndex?: number | null;
  termination?: {
    stopped: boolean;
    reason: string;
    codeLocation: string;
  };
}): void {
  const { diagnostic } = input;

  logIfNodeTrace({
    stage: "if_node_edge_resolution",
    runId: input.runId,
    sessionId: input.sessionId,
    flowVersionId: input.flowVersionId,
    nodeId: input.nodeId,
    requestedBranch: diagnostic.requestedBranch,
    outgoingEdges: diagnostic.outgoingEdges,
    selectedEdge: diagnostic.selectedEdge,
    nextNodeId: diagnostic.nextNodeId,
    selectionReason: diagnostic.selectionReason,
    noEdgeReason: diagnostic.noEdgeReason ?? null,
    matchedRuleIndex: input.matchedRuleIndex ?? null,
    termination: input.termination ?? null,
  });

  logIfNodeTrace({
    stage: "if_node_complete",
    runId: input.runId,
    sessionId: input.sessionId,
    flowVersionId: input.flowVersionId,
    nodeId: input.nodeId,
    branch: diagnostic.requestedBranch,
    matchedRuleIndex: input.matchedRuleIndex ?? null,
    selectedEdge: diagnostic.selectedEdge,
    nextNodeId: diagnostic.nextNodeId,
    continued: Boolean(diagnostic.nextNodeId),
    stopReason: diagnostic.nextNodeId ? null : (diagnostic.noEdgeReason ?? diagnostic.selectionReason),
    termination: input.termination ?? null,
  });
}

export function traceLegacyIfNodeEvaluation(input: {
  context: ExecutionContext;
  variable: string;
  expected: unknown;
  actual: unknown;
  branch: "yes" | "no";
}): void {
  logIfNodeTrace({
    stage: "if_node_evaluation",
    runId: input.context.run.id,
    sessionId: input.context.session.id,
    flowVersionId: input.context.run.flow_version_id ?? input.context.session.flow_version_id ?? null,
    nodeId: input.context.currentNode.id,
    incomingVariables: input.context.variables,
    incomingInput: input.context.input ?? null,
    resolvedFieldValues: { [input.variable]: input.actual },
    clauses: [
      {
        field: input.variable,
        operator: "equals",
        expectedValue: input.expected,
        actualValue: input.actual,
        matched: input.branch === "yes",
        ruleIndex: 0,
      },
    ],
    branch: input.branch,
    matchedRuleIndex: input.branch === "yes" ? 0 : 0,
    evaluationReason:
      input.branch === "yes"
        ? `${input.variable} equals ${JSON.stringify(input.expected)}`
        : `${input.variable} does not equal ${JSON.stringify(input.expected)} (actual: ${JSON.stringify(input.actual)})`,
  });
}

export function traceIfNodeAfterExecution(input: {
  context: ExecutionContext;
  branch: "yes" | "no";
  matchedRuleIndex: number | null;
  edges: AutomationEdgeRecord[];
  variables: Record<string, unknown>;
  executionPath: "resume" | "executeFromNode";
}): ConditionEdgeResolutionDiagnostic {
  const diagnostic = diagnoseConditionEdgeResolution(input.context.currentNode, input.edges, input.variables);

  const termination = diagnostic.nextNodeId
    ? undefined
    : {
        stopped: true,
        reason:
          diagnostic.noEdgeReason ??
          `No routable edge after IF node (${input.executionPath}); workflow completed at condition node.`,
        codeLocation:
          input.executionPath === "resume"
            ? "automation-engine.ts:resume:247-253"
            : "automation-engine.ts:executeFromNode:451-457",
      };

  traceIfNodeEdgeResolution({
    runId: input.context.run.id,
    sessionId: input.context.session.id,
    flowVersionId: input.context.run.flow_version_id ?? input.context.session.flow_version_id ?? null,
    nodeId: input.context.currentNode.id,
    variables: input.variables,
    diagnostic,
    matchedRuleIndex: input.matchedRuleIndex,
    termination,
  });

  return diagnostic;
}

export function executeIfRuleSetWithTrace(
  context: ExecutionContext,
  ruleSet: CompiledRuleSet,
): { branch: "yes" | "no"; evaluation: IfNodeEvaluationDiagnostic } {
  traceIfNodeEntered(context);
  const evaluation = evaluateIfNodeWithDiagnostics(ruleSet, context.variables);
  traceIfNodeEvaluation({ context, evaluation });
  return { branch: evaluation.branch, evaluation };
}
