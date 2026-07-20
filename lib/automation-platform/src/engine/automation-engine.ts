import { AUTOMATION_PERMISSIONS, type ExecutionLifecycleStatus } from "../constants.js";
import {
  AutomationExecutionError,
  AutomationFlowNotFoundError,
  AutomationFlowStateError,
  AutomationRunNotFoundError,
  PermissionDeniedError,
} from "../errors.js";
import type {
  AutomationEdgeRepository,
  AutomationFlowRepository,
  AutomationNodeRepository,
  AutomationRunRepository,
  ConversationSessionRepository,
} from "../repositories/automation-repositories.js";
import type {
  AutomationExecutionResult,
  ResumeAutomationExecutionInput,
  ServiceContext,
  StartAutomationExecutionInput,
} from "../types.js";
import { loadExecutionGraph } from "../lifecycle/execution-graph.js";
import type { AutomationFlowVersionRepository } from "../lifecycle/version-repository.js";
import { findNodeById, loadFlowGraph, resolveNextNodeId } from "./flow-graph.js";
import {
  mergeVariables,
  type ExecutionContext,
  type NodeExecutionOutcome,
} from "./execution-context.js";
import type { AutomationNodeRegistry } from "./node-registry.js";
import { createAutomationRuntimeStore, runLifecycle } from "./runtime-store.js";

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

export class AutomationEngine {
  private readonly runtimeStore;

  constructor(
    private readonly deps: {
      flows: AutomationFlowRepository;
      nodes: AutomationNodeRepository;
      edges: AutomationEdgeRepository;
      runs: AutomationRunRepository;
      sessions: ConversationSessionRepository;
      versions: AutomationFlowVersionRepository;
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

    const flow = await this.deps.flows.findById(input.flowId);
    if (!flow) throw new AutomationFlowNotFoundError(input.flowId);
    if (flow.company_id !== input.companyId) throw new PermissionDeniedError(AUTOMATION_PERMISSIONS.view);
    if (flow.status !== "active") throw new AutomationFlowStateError("Only active flows can be executed.");

    const graphBundle = await loadExecutionGraph(flow, {
      nodes: this.deps.nodes,
      edges: this.deps.edges,
      versions: this.deps.versions,
    });
    const nodes = graphBundle.nodes;
    const edges = graphBundle.edges;
    const graph = loadFlowGraph(nodes, edges);

    const run = await this.deps.runs.create({
      companyId: input.companyId,
      flowId: flow.id,
      triggerSource: input.triggerSource ?? "manual",
      status: "pending",
      variables: input.initialVariables ?? {},
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
      runId: run.id,
      currentNodeId: graph.startNode.id,
      status: "active",
      variables: input.initialVariables ?? {},
    });

    await this.deps.runs.updateState({
      runId: run.id,
      sessionId: session.id,
      status: "running",
      currentNodeId: graph.startNode.id,
      variables: input.initialVariables ?? {},
    });

    return this.executeFromNode(ctx, {
      companyId: input.companyId,
      flow,
      run: { ...run, session_id: session.id, status: "running" },
      session: { ...session, run_id: run.id },
      nodes,
      edges,
      startNodeId: graph.startNode.id,
      variables: input.initialVariables ?? {},
    });
  }

  async resume(ctx: ServiceContext, input: ResumeAutomationExecutionInput): Promise<AutomationExecutionResult> {
    assertPermission(ctx, AUTOMATION_PERMISSIONS.execute);

    const run = await this.deps.runs.findById(input.runId);
    if (!run) throw new AutomationRunNotFoundError(input.runId);
    assertCompanyAccess(ctx, run.company_id);
    if (run.status !== "waiting_input") {
      throw new AutomationExecutionError(`Run ${run.id} is not waiting for input.`);
    }
    if (!run.session_id || !run.current_node_id) {
      throw new AutomationExecutionError(`Run ${run.id} is missing session or current node state.`);
    }

    const session = await this.deps.sessions.findById(run.session_id);
    if (!session) throw new AutomationExecutionError(`Session ${run.session_id} not found for run ${run.id}.`);

    const flow = await this.deps.flows.findById(run.flow_id);
    if (!flow) throw new AutomationFlowNotFoundError(run.flow_id);

    const graphBundle = await loadExecutionGraph(flow, {
      nodes: this.deps.nodes,
      edges: this.deps.edges,
      versions: this.deps.versions,
      versionId: typeof run.metadata?.flowVersionId === "string" ? run.metadata.flowVersionId : flow.active_version_id,
    });
    const nodes = graphBundle.nodes;
    const edges = graphBundle.edges;

    const currentNode = findNodeById(run.current_node_id, nodes);
    const handler = this.deps.registry.get(currentNode.type);
    const executionContext = this.buildContext({
      flow,
      run,
      session,
      nodes,
      edges,
      currentNode,
      variables: run.variables,
      input: input.input,
    });

    handler.validate(executionContext);
    const nodeResult = await handler.execute(executionContext);
    let variables = mergeVariables(run.variables, nodeResult.variables);

    if (nodeResult.outcome === "waiting_input") {
      return this.finalize(run, session, {
        lifecycle: "waiting_input",
        currentNodeId: currentNode.id,
        variables,
      });
    }
    if (nodeResult.outcome === "failed") {
      return this.finalize(run, session, {
        lifecycle: "failed",
        currentNodeId: currentNode.id,
        variables,
        errorMessage: nodeResult.errorMessage,
      });
    }

    const nextNodeId =
      nodeResult.outcome === "completed"
        ? null
        : resolveNextNodeId(currentNode, { edges }, variables);

    if (!nextNodeId) {
      return this.finalize(run, session, {
        lifecycle: "completed",
        currentNodeId: currentNode.id,
        variables,
      });
    }

    return this.executeFromNode(ctx, {
      companyId: run.company_id,
      flow,
      run,
      session,
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
      currentNodeId: run.current_node_id,
      variables: run.variables,
    });
  }

  private async executeFromNode(
    ctx: ServiceContext,
    input: {
      companyId: string;
      flow: ExecutionContext["flow"];
      run: ExecutionContext["run"];
      session: ExecutionContext["session"];
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
      await this.runtimeStore.updateRunningState({
        runId: input.run.id,
        sessionId: input.session.id,
        currentNodeId: currentNode.id,
        variables,
      });

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
      const nodeResult = await handler.execute(executionContext);
      variables = mergeVariables(variables, nodeResult.variables);

      if (nodeResult.outcome !== "continue") {
        const lifecycle = outcomeToLifecycle(nodeResult.outcome);
        return this.finalize(input.run, input.session, {
          lifecycle,
          currentNodeId: currentNode.id,
          variables,
          errorMessage: nodeResult.errorMessage,
        });
      }

      const nextNodeId = resolveNextNodeId(currentNode, graph, variables);
      if (!nextNodeId) {
        return this.finalize(input.run, input.session, {
          lifecycle: "completed",
          currentNodeId: currentNode.id,
          variables,
        });
      }

      currentNode = findNodeById(nextNodeId, input.nodes);
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
      currentNodeId: string | null;
      variables: Record<string, unknown>;
      errorMessage?: string | null;
    },
  ): Promise<AutomationExecutionResult> {
    const persisted = await this.runtimeStore.updateTerminalState({
      runId: run.id,
      sessionId: session.id,
      lifecycle: input.lifecycle,
      currentNodeId: input.currentNodeId,
      variables: input.variables,
      errorMessage: input.errorMessage ?? null,
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
