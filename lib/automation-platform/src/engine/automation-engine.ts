import { AUTOMATION_PERMISSIONS, type ExecutionLifecycleStatus } from "../constants.js";
import {
  AutomationExecutionError,
  AutomationFlowNotFoundError,
  AutomationFlowStateError,
  AutomationRunNotFoundError,
  PermissionDeniedError,
} from "../errors.js";
import type {
  AutomationFlowRepository,
  AutomationRunRepository,
  ConversationSessionRepository,
} from "../repositories/automation-repositories.js";
import type {
  AutomationExecutionResult,
  AutomationRunRecord,
  ResumeAutomationExecutionInput,
  ServiceContext,
  StartAutomationExecutionInput,
} from "../types.js";
import type { NodeExecutionResult } from "./execution-context.js";
import {
  loadExecutionGraph,
  resolveExecutionVersionId,
} from "../lifecycle/execution-graph.js";
import type { AutomationFlowVersionRepository } from "../lifecycle/version-repository.js";
import type { AutomationFlowVersionGraphRepository } from "../lifecycle/version-graph-repository.js";
import { findNodeById, loadFlowGraph, resolveNextNodeId } from "./flow-graph.js";
import { isInteractiveActionNode, resolveInteractiveNextNode } from "./interactive-routing.js";
import { traceIfNodeAfterExecution } from "../debug/if-node-trace-debug.js";
import {
  mergeVariables,
  type ExecutionContext,
  type NodeExecutionOutcome,
} from "./execution-context.js";
import type { AutomationNodeRegistry } from "./node-registry.js";
import { createAutomationRuntimeStore, runLifecycle } from "./runtime-store.js";
import { assertWorkflowExecutionAllowed } from "../utils/workflow-guards.js";
import { STALE_WAITING_RUN_REASON, isTerminalRunStatus, ABANDONED_ACTIVE_RUN_REASON } from "../orchestrator/session-policy.js";
import { validateInteractiveResumeInput } from "../orchestrator/interactive-resume-validation.js";
import {
  abandonAllActiveExecutionsForUser,
  listActiveExecutions,
} from "../orchestrator/active-execution-manager.js";
import { resetOutboundQueue } from "../runtime/outbound-queue.js";
import { findPrimaryMenuNode } from "../runtime/main-menu.js";
import {
  consumeActiveListVisit,
  logAfterPersistWaitingState,
  logAfterTransactionCommit,
} from "../debug/list-node-lifecycle-debug.js";
import { readOutboundQueue } from "../runtime/outbound-queue.js";
import {
  flushExecutedNodeTrail,
  recordExecutedNode,
  traceWorkflowEdgeSelected,
  traceWorkflowExecutionIdentity,
  traceWorkflowNodeCompleted,
  traceWorkflowNodeEntered,
  traceWorkflowRunFinalized,
  traceWorkflowRunStarted,
} from "../debug/workflow-execution-trace-debug.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new PermissionDeniedError(permission);
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) throw new PermissionDeniedError(AUTOMATION_PERMISSIONS.view);
}

function outcomeToLifecycle(outcome: NodeExecutionOutcome): ExecutionLifecycleStatus {
  if (outcome === "waiting_input") return "waiting_input";
  if (outcome === "failed") return "failed";
  if (outcome === "completed") return "completed";
  return "running";
}

function resolvePinnedFlowVersionId(input: {
  flow_version_id: string | null;
  metadata: Record<string, unknown>;
}): string | null {
  if (input.flow_version_id) return input.flow_version_id;
  return typeof input.metadata?.flowVersionId === "string" ? input.metadata.flowVersionId : null;
}

export class AutomationEngine {
  private readonly runtimeStore;

  constructor(
    private readonly deps: {
      flows: AutomationFlowRepository;
      runs: AutomationRunRepository;
      sessions: ConversationSessionRepository;
      versions: AutomationFlowVersionRepository;
      versionGraph: AutomationFlowVersionGraphRepository;
      registry: AutomationNodeRegistry;
    },
  ) {
    this.runtimeStore = createAutomationRuntimeStore({
      updateRun: (input) => deps.runs.updateState(input),
      updateSession: (input) => deps.sessions.updateState(input),
    });
  }

  async start(ctx: ServiceContext, input: StartAutomationExecutionInput): Promise<AutomationExecutionResult> {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.execute);
    assertCompanyAccess(ctx, input.companyId);
    assertWorkflowExecutionAllowed(ctx);

    if (input.externalUserId) {
      await abandonAllActiveExecutionsForUser(this, ctx, {
        sessions: this.deps.sessions,
        runs: this.deps.runs,
      }, {
        companyId: input.companyId,
        channel: input.channel,
        externalUserId: input.externalUserId,
        boundFlowId: input.flowId,
        reason: "start_new_execution",
      });
    }

    const flow = await this.deps.flows.findById(input.flowId);
    if (!flow) throw new AutomationFlowNotFoundError(input.flowId);
    if (flow.company_id !== input.companyId) throw new PermissionDeniedError(AUTOMATION_PERMISSIONS.view);
    if (flow.status !== "active") throw new AutomationFlowStateError("Only active flows can be executed.");

    const versionId = await resolveExecutionVersionId({ flow });
    const graphBundle = await loadExecutionGraph(flow, {
      versions: this.deps.versions,
      versionGraph: this.deps.versionGraph,
      versionId,
    });
    const nodes = graphBundle.nodes;
    const edges = graphBundle.edges;
    const graph = loadFlowGraph(nodes, edges);

    const run = await this.deps.runs.create({
      companyId: input.companyId,
      flowId: flow.id,
      triggerSource: input.triggerSource ?? "manual",
      status: "pending",
      variables: resetOutboundQueue(input.initialVariables ?? {}),
      flowVersionId: graphBundle.versionId,
      metadata: {
        flowVersionId: graphBundle.versionId,
        flowVersionNumber: graphBundle.versionNumber,
      },
    });

    const session = await this.deps.sessions.create({
      companyId: input.companyId,
      channel: input.channel,
      externalUserId: input.externalUserId ?? null,
      customerId: input.customerId ?? null,
      flowId: flow.id,
      flowVersionId: graphBundle.versionId,
      runId: run.id,
      currentNodeId: graph.startNode.id,
      status: "active",
      variables: resetOutboundQueue(input.initialVariables ?? {}),
    });

    const pinnedRun = {
      ...run,
      session_id: session.id,
      status: "running" as const,
      flow_version_id: graphBundle.versionId,
    };
    const pinnedSession = {
      ...session,
      run_id: run.id,
      flow_version_id: graphBundle.versionId,
    };

    await this.deps.runs.updateState({
      runId: run.id,
      sessionId: session.id,
      status: "running",
      flowVersionId: graphBundle.versionId,
      currentNodeId: graph.startNode.id,
      variables: resetOutboundQueue(input.initialVariables ?? {}),
    });

    traceWorkflowRunStarted({
      runId: run.id,
      sessionId: session.id,
      flowId: flow.id,
      flowVersionId: graphBundle.versionId,
      triggerSource: input.triggerSource ?? "manual",
      startNode: graph.startNode,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    });

    traceWorkflowExecutionIdentity({
      runId: run.id,
      sessionId: session.id,
      workflowId: flow.id,
      automationFlowId: flow.id,
      publishedVersionId: flow.active_version_id ?? graphBundle.versionId,
      publishedVersionNumber: flow.version,
      flowActiveVersionId: flow.active_version_id,
      executedVersionId: graphBundle.versionId,
      executedVersionNumber: graphBundle.versionNumber,
      hasUnpublishedDraft: flow.has_unpublished_draft,
      versionPinned: false,
      versionMatchesPublished: flow.active_version_id === graphBundle.versionId,
      graphSource: graphBundle.graphSource,
      startNodeId: graph.startNode.id,
      startNodeType: graph.startNode.type,
      startNodeAction:
        typeof graph.startNode.config.action === "string" ? graph.startNode.config.action : null,
      triggerSource: input.triggerSource ?? "manual",
      executionPath: "start",
    });

    return this.executeFromNode(ctx, {
      companyId: input.companyId,
      flow,
      run: pinnedRun,
      session: pinnedSession,
      flowVersionId: graphBundle.versionId,
      nodes,
      edges,
      startNodeId: graph.startNode.id,
      variables: resetOutboundQueue(input.initialVariables ?? {}),
    });
  }

  async resume(ctx: ServiceContext, input: ResumeAutomationExecutionInput): Promise<AutomationExecutionResult> {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.execute);
    assertWorkflowExecutionAllowed(ctx);

    const run = await this.deps.runs.findById(input.runId);
    if (!run) throw new AutomationRunNotFoundError(input.runId);
    assertCompanyAccess(ctx, run.company_id);
    if (run.status !== "waiting_input") {
      throw new AutomationExecutionError(`Run ${run.id} is not waiting for input.`);
    }
    if (!run.session_id || !run.current_node_id) {
      throw new AutomationExecutionError(`Run ${run.id} is missing session or current node state.`);
    }

    const pinnedVersionId = resolvePinnedFlowVersionId(run);
    if (!pinnedVersionId) {
      throw new AutomationExecutionError(`Run ${run.id} is missing a pinned workflow version.`);
    }

    const session = await this.deps.sessions.findById(run.session_id);
    if (!session) throw new AutomationExecutionError(`Session ${run.session_id} not found for run ${run.id}.`);

    const sessionVersionId = resolvePinnedFlowVersionId(session);
    if (sessionVersionId && sessionVersionId !== pinnedVersionId) {
      throw new AutomationExecutionError(
        `Session ${session.id} version ${sessionVersionId} does not match run version ${pinnedVersionId}.`,
      );
    }

    const flow = await this.deps.flows.findById(run.flow_id);
    if (!flow) throw new AutomationFlowNotFoundError(run.flow_id);

    const graphBundle = await loadExecutionGraph(flow, {
      versions: this.deps.versions,
      versionGraph: this.deps.versionGraph,
      versionId: pinnedVersionId,
    });
    const nodes = graphBundle.nodes;
    const edges = graphBundle.edges;

    const currentNode = findNodeById(run.current_node_id, nodes);
    const handler = this.deps.registry.get(currentNode.type);

    traceWorkflowExecutionIdentity({
      runId: run.id,
      sessionId: session.id,
      workflowId: flow.id,
      automationFlowId: flow.id,
      publishedVersionId: flow.active_version_id ?? pinnedVersionId,
      publishedVersionNumber: flow.version,
      flowActiveVersionId: flow.active_version_id,
      executedVersionId: graphBundle.versionId,
      executedVersionNumber: graphBundle.versionNumber,
      hasUnpublishedDraft: flow.has_unpublished_draft,
      versionPinned: true,
      versionMatchesPublished: flow.active_version_id === graphBundle.versionId,
      graphSource: graphBundle.graphSource,
      startNodeId: currentNode.id,
      startNodeType: currentNode.type,
      startNodeAction: typeof currentNode.config.action === "string" ? currentNode.config.action : null,
      triggerSource: run.trigger_source,
      executionPath: "resume",
    });

    recordExecutedNode(run.id, currentNode);

    const resumeVariables = resetOutboundQueue(run.variables);

    try {
      validateInteractiveResumeInput({
        run,
        currentNode,
        resumeInput: input.input ?? {},
      });
      const executionContext = this.buildContext({
        flow,
        run,
        session,
        nodes,
        edges,
        currentNode,
        variables: resumeVariables,
        input: input.input,
      });

      handler.validate(executionContext);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.finalize(run, session, {
        lifecycle: "waiting_input",
        flowVersionId: pinnedVersionId,
        currentNodeId: currentNode.id,
        variables: mergeVariables(resumeVariables, {
          __waitingFor: run.variables.__waitingFor ?? null,
          __prompt: "That selection was not valid. Please try again.",
        }),
        errorMessage,
      });
    }

    let claimedRun: AutomationRunRecord;
    try {
      claimedRun = await this.deps.runs.updateState({
        runId: run.id,
        status: "running",
        expectedStatus: "waiting_input",
        flowVersionId: pinnedVersionId,
        currentNodeId: currentNode.id,
        sessionId: session.id,
        variables: resumeVariables,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new AutomationExecutionError(
        errorMessage.includes("concurrently")
          ? errorMessage
          : `Run ${run.id} could not be resumed because its state changed concurrently.`,
      );
    }

    const executionContext = this.buildContext({
      flow,
      run: claimedRun,
      session,
      nodes,
      edges,
      currentNode,
      variables: resumeVariables,
      input: input.input,
    });

    let nodeResult: NodeExecutionResult;
    try {
      nodeResult = await handler.execute(executionContext);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.finalize(claimedRun, session, {
        lifecycle: "failed",
        flowVersionId: pinnedVersionId,
        currentNodeId: currentNode.id,
        variables: resumeVariables,
        errorMessage,
      });
    }
    let variables = mergeVariables(resumeVariables, nodeResult.variables);

    if (nodeResult.outcome === "waiting_input") {
      return this.finalize(claimedRun, session, {
        lifecycle: "waiting_input",
        flowVersionId: pinnedVersionId,
        currentNodeId: currentNode.id,
        variables,
      });
    }
    if (nodeResult.outcome === "failed") {
      return this.finalize(claimedRun, session, {
        lifecycle: "failed",
        flowVersionId: pinnedVersionId,
        currentNodeId: currentNode.id,
        variables,
        errorMessage: nodeResult.errorMessage,
      });
    }

    const nextNodeId =
      nodeResult.outcome === "completed"
        ? null
        : isInteractiveActionNode(currentNode)
          ? resolveInteractiveNextNode(currentNode, { edges, nodes }, variables).nextNodeId
          : resolveNextNodeId(currentNode, { edges }, variables);

    if (!nextNodeId) {
      return this.finalize(claimedRun, session, {
        lifecycle: "completed",
        flowVersionId: pinnedVersionId,
        currentNodeId: currentNode.id,
        variables,
      });
    }

    return this.executeFromNode(ctx, {
      companyId: claimedRun.company_id,
      flow,
      run: claimedRun,
      session,
      flowVersionId: pinnedVersionId,
      nodes,
      edges,
      startNodeId: nextNodeId,
      variables,
    });
  }

  async cancel(ctx: ServiceContext, runId: string): Promise<AutomationExecutionResult> {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.execute);
    const run = await this.deps.runs.findById(runId);
    if (!run) throw new AutomationRunNotFoundError(runId);
    assertCompanyAccess(ctx, run.company_id);
    if (!run.session_id) throw new AutomationExecutionError(`Run ${run.id} has no linked session.`);

    const session = await this.deps.sessions.findById(run.session_id);
    if (!session) throw new AutomationExecutionError(`Session ${run.session_id} not found.`);

    return this.finalize(run, session, {
      lifecycle: "cancelled",
      flowVersionId: resolvePinnedFlowVersionId(run),
      currentNodeId: run.current_node_id,
      variables: run.variables,
    });
  }

  /**
   * Terminates any non-terminal run before starting a fresh workflow for the user.
   */
  async abandonActiveRun(
    ctx: ServiceContext,
    input: { runId: string; reason?: string },
  ): Promise<AutomationExecutionResult | null> {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.execute);

    const run = await this.deps.runs.findById(input.runId);
    if (!run) throw new AutomationRunNotFoundError(input.runId);
    assertCompanyAccess(ctx, run.company_id);

    if (isTerminalRunStatus(run.status)) {
      return null;
    }

    const reason = input.reason?.trim() || ABANDONED_ACTIVE_RUN_REASON;
    const variables = {
      ...run.variables,
      __abandonedReason: reason,
      __abandonedAt: new Date().toISOString(),
    };

    if (!run.session_id) {
      const persisted = await this.deps.runs.updateState({
        runId: run.id,
        status: "cancelled",
        currentNodeId: null,
        variables,
        errorMessage: reason,
        finishedAt: new Date().toISOString(),
      });
      return {
        lifecycle: "cancelled",
        run: persisted,
        session: {
          id: run.session_id ?? "missing-session",
          company_id: run.company_id,
          channel: "api",
          external_user_id: null,
          customer_id: null,
          flow_id: run.flow_id,
          flow_version_id: run.flow_version_id,
          run_id: run.id,
          current_node_id: null,
          status: "cancelled",
          started_at: run.started_at,
          last_activity_at: new Date().toISOString(),
          metadata: {},
          variables: {},
        },
        currentNodeId: null,
        variables,
      };
    }

    const session = await this.deps.sessions.findById(run.session_id);
    if (!session) {
      const persisted = await this.deps.runs.updateState({
        runId: run.id,
        status: "cancelled",
        currentNodeId: null,
        variables,
        errorMessage: reason,
        finishedAt: new Date().toISOString(),
      });
      return {
        lifecycle: "cancelled",
        run: persisted,
        session: {
          id: run.session_id,
          company_id: run.company_id,
          channel: "api",
          external_user_id: null,
          customer_id: null,
          flow_id: run.flow_id,
          flow_version_id: run.flow_version_id,
          run_id: run.id,
          current_node_id: null,
          status: "cancelled",
          started_at: run.started_at,
          last_activity_at: new Date().toISOString(),
          metadata: {},
          variables: {},
        },
        currentNodeId: null,
        variables,
      };
    }

    return this.finalize(run, session, {
      lifecycle: "cancelled",
      flowVersionId: resolvePinnedFlowVersionId(run) ?? session.flow_version_id,
      currentNodeId: null,
      variables,
      errorMessage: reason,
    });
  }

  /**
   * @deprecated Use abandonActiveRun — kept for backward compatibility.
   */
  async abandonStaleWaitingRun(
    ctx: ServiceContext,
    input: { runId: string; reason?: string },
  ): Promise<AutomationExecutionResult | null> {
    return this.abandonActiveRun(ctx, {
      runId: input.runId,
      reason: input.reason ?? STALE_WAITING_RUN_REASON,
    });
  }

  async listActiveExecutionsForUser(input: {
    companyId: string;
    channel: StartAutomationExecutionInput["channel"];
    externalUserId: string;
    boundFlowId: string;
  }) {
    return listActiveExecutions(
      { sessions: this.deps.sessions, runs: this.deps.runs },
      input,
    );
  }

  private async executeFromNode(
    ctx: ServiceContext,
    input: {
      companyId: string;
      flow: ExecutionContext["flow"];
      run: ExecutionContext["run"];
      session: ExecutionContext["session"];
      flowVersionId: string;
      nodes: ExecutionContext["nodes"];
      edges: ExecutionContext["edges"];
      startNodeId: string;
      variables: Record<string, unknown>;
      userInput?: Record<string, unknown>;
    },
  ): Promise<AutomationExecutionResult> {
    void ctx;
    let currentNode = findNodeById(input.startNodeId, input.nodes);
    let variables = { ...input.variables };
    const graph = { nodes: input.nodes, edges: input.edges };

    while (true) {
      try {
      await this.runtimeStore.updateRunningState({
        runId: input.run.id,
        sessionId: input.session.id,
        flowVersionId: input.flowVersionId,
        currentNodeId: currentNode.id,
        variables,
      });

      traceWorkflowNodeEntered({
        runId: input.run.id,
        sessionId: input.session.id,
        node: currentNode,
        executionPath: "executeFromNode",
        hasUserInput: Boolean(input.userInput && Object.keys(input.userInput).length > 0),
      });

      recordExecutedNode(input.run.id, currentNode);

      const handler = this.deps.registry.get(currentNode.type);
      const executionContext = this.buildContext({
        flow: input.flow,
        run: input.run,
        session: input.session,
        nodes: input.nodes,
        edges: input.edges,
        currentNode,
        variables,
        input: input.userInput,
      });

      handler.validate(executionContext);
      let nodeResult: NodeExecutionResult;
      try {
        nodeResult = await handler.execute(executionContext);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return this.finalize(input.run, input.session, {
          lifecycle: "failed",
          flowVersionId: input.flowVersionId,
          currentNodeId: currentNode.id,
          variables,
          errorMessage,
        });
      }
      variables = mergeVariables(variables, nodeResult.variables);

      const outboundQueue = readOutboundQueue(variables);
      const latestOutbound = variables.__outbound;
      traceWorkflowNodeCompleted({
        runId: input.run.id,
        sessionId: input.session.id,
        node: currentNode,
        outcome: nodeResult.outcome,
        output: nodeResult.output,
        outboundQueueLength: outboundQueue.length,
        latestOutboundKind:
          latestOutbound && typeof latestOutbound === "object" && !Array.isArray(latestOutbound)
            ? String((latestOutbound as { kind?: unknown }).kind ?? "unknown")
            : null,
        waitingFor:
          typeof variables.__waitingFor === "string" ? variables.__waitingFor : null,
      });

      if (nodeResult.output?.redirectToPrimaryMenu === true) {
        currentNode = findPrimaryMenuNode(input.nodes);
        input.userInput = undefined;
        continue;
      }

      if (nodeResult.outcome !== "continue") {
        const lifecycle = outcomeToLifecycle(nodeResult.outcome);
        return this.finalize(input.run, input.session, {
          lifecycle,
          flowVersionId: input.flowVersionId,
          currentNodeId: currentNode.id,
          variables,
          errorMessage: nodeResult.errorMessage,
        });
      }

      let nextNodeId: string | null;
      if (currentNode.type === "condition") {
        const matchedRuleIndex =
          typeof nodeResult.output?.matchedRuleIndex === "number" ? nodeResult.output.matchedRuleIndex : null;
        const branch = variables.__branch === "yes" ? "yes" : "no";
        const edgeDiagnostic = traceIfNodeAfterExecution({
          context: {
            ...executionContext,
            variables,
          },
          branch,
          matchedRuleIndex,
          edges: input.edges,
          variables,
          executionPath: "executeFromNode",
        });
        nextNodeId = edgeDiagnostic.nextNodeId;
        traceWorkflowEdgeSelected({
          runId: input.run.id,
          sessionId: input.session.id,
          fromNode: currentNode,
          toNode: nextNodeId ? findNodeById(nextNodeId, input.nodes) : null,
          nextNodeId,
          selectionReason: edgeDiagnostic.selectionReason,
          requestedBranch: branch,
          selectedEdge: edgeDiagnostic.selectedEdge
            ? {
                edgeId: edgeDiagnostic.selectedEdge.edgeId,
                targetNodeId: edgeDiagnostic.selectedEdge.targetNodeId,
                conditionBranch: edgeDiagnostic.selectedEdge.resolvedBranch,
              }
            : null,
        });
      } else {
        nextNodeId = resolveNextNodeId(currentNode, graph, variables);
        traceWorkflowEdgeSelected({
          runId: input.run.id,
          sessionId: input.session.id,
          fromNode: currentNode,
          toNode: nextNodeId ? findNodeById(nextNodeId, input.nodes) : null,
          nextNodeId,
          selectionReason: "resolveNextNodeId()",
        });
      }

      if (!nextNodeId) {
        return this.finalize(input.run, input.session, {
          lifecycle: "completed",
          flowVersionId: input.flowVersionId,
          currentNodeId: currentNode.id,
          variables,
        });
      }

      currentNode = findNodeById(nextNodeId, input.nodes);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return this.finalize(input.run, input.session, {
          lifecycle: "failed",
          flowVersionId: input.flowVersionId,
          currentNodeId: currentNode.id,
          variables,
          errorMessage,
        });
      }
    }
  }

  private buildContext(input: {
    flow: ExecutionContext["flow"];
    run: ExecutionContext["run"];
    session: ExecutionContext["session"];
    nodes: ExecutionContext["nodes"];
    edges: ExecutionContext["edges"];
    currentNode: ExecutionContext["currentNode"];
    variables: Record<string, unknown>;
    input?: Record<string, unknown>;
  }): ExecutionContext {
    return {
      company: { id: input.flow.company_id },
      flow: input.flow,
      run: input.run,
      session: input.session,
      variables: input.variables,
      customer: { id: input.session.customer_id },
      currentNode: input.currentNode,
      nodes: input.nodes,
      edges: input.edges,
      input: input.input,
    };
  }

  private async finalize(
    run: ExecutionContext["run"],
    session: ExecutionContext["session"],
    input: {
      lifecycle: ExecutionLifecycleStatus;
      flowVersionId: string | null;
      currentNodeId: string | null;
      variables: Record<string, unknown>;
      errorMessage?: string | null;
    },
  ): Promise<AutomationExecutionResult> {
    const persisted = await this.runtimeStore.updateTerminalState({
      runId: run.id,
      sessionId: session.id,
      lifecycle: input.lifecycle,
      flowVersionId: input.flowVersionId,
      currentNodeId: input.currentNodeId,
      variables: input.variables,
      errorMessage: input.errorMessage ?? null,
    });

    if (input.lifecycle === "waiting_input" && input.currentNodeId) {
      const listVisitIndex = consumeActiveListVisit(run.id, input.currentNodeId);
      const waitingInput =
        typeof input.variables.__waitingFor === "string" ? input.variables.__waitingFor : null;
      const outboundQueueLength = readOutboundQueue(input.variables).length;
      const persistPayload = {
        runId: run.id,
        sessionId: session.id,
        nodeId: input.currentNodeId,
        listVisitIndex,
        lifecycle: input.lifecycle,
        currentNodeId: persisted.run.current_node_id,
        sessionStatus: persisted.session.status,
        runStatus: persisted.run.status,
        waitingInput,
        outboundQueueLength,
      };
      logAfterPersistWaitingState(persistPayload);
      logAfterTransactionCommit(persistPayload);
    }

    const outboundQueue = readOutboundQueue(input.variables);
    flushExecutedNodeTrail({
      runId: run.id,
      sessionId: session.id,
      lifecycle: input.lifecycle,
    });
    traceWorkflowRunFinalized({
      runId: run.id,
      sessionId: session.id,
      lifecycle: input.lifecycle,
      currentNodeId: input.currentNodeId,
      outboundQueueLength: outboundQueue.length,
      outboundMessages: outboundQueue.map((entry) => ({
        kind: entry.kind,
        preview:
          ("text" in entry && typeof entry.text === "string" ? entry.text : null) ??
          ("body" in entry && typeof entry.body === "string" ? entry.body : null) ??
          ("title" in entry && typeof entry.title === "string" ? entry.title : null),
      })),
    });

    return {
      lifecycle: input.lifecycle,
      run: persisted.run,
      session: persisted.session,
      currentNodeId: input.currentNodeId,
      variables: input.variables,
    };
  }
}

export { runLifecycle };
