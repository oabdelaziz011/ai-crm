import {
  diagnoseConditionEdgeResolution,
  findNodeById,
  loadFlowGraph,
  readConditionBranch,
  resolveNextNodeId,
  type AutomationNodeRecord,
} from "@workspace/automation-platform";
import { validateWorkflow } from "../../core/validation/workflow-validator";
import type { WorkflowDocument } from "../../core/types";
import { documentToSnapshot } from "../../core/lifecycle/snapshot-mapper";
import type { SimulationSessionRepository } from "../repositories/simulation-session-repository";
import {
  buildPathExplorer,
  buildSimulationErrors,
  buildSimulationReport,
} from "../selectors/simulation-selectors";
import { computeWorkflowDocumentFingerprint } from "../utilities/simulation-document-fingerprint";
import { buildDefaultSimulatedInput } from "../utilities/simulation-interactive-input";
import { readBuilderNodeLabel, snapshotToRuntimeGraph } from "../utilities/simulation-graph";
import { SIMULATION_STEP_BATCH_SIZE, yieldToMainThread } from "../utilities/simulation-scheduling";
import { createIdleSimulationSnapshot } from "../utilities/simulation-snapshot-utils";
import type { SimulationInternalSession } from "../types/simulation-session-types";
import type {
  SimulationResumeOptions,
  SimulationSnapshot,
  SimulationStartOptions,
  SimulationTimelineEntry,
} from "../types/simulation-types";
import { executeSimulationNode } from "./simulation-node-executor";
import { applyVariablePatch, createInitialSimulationVariables } from "./simulation-variable-engine";

let timelineCounter = 0;

function createTimelineEntry(
  type: SimulationTimelineEntry["type"],
  nodeId: string | null,
  label: string,
  detail?: string,
): SimulationTimelineEntry {
  timelineCounter += 1;
  return {
    id: `sim-event-${timelineCounter}`,
    timestamp: new Date().toISOString(),
    type,
    nodeId,
    label,
    detail,
  };
}

export class SimulationService {
  constructor(private readonly repository: SimulationSessionRepository) {}

  disposeScope(companyId: string, flowId: string): void {
    this.repository.disposeScope(companyId, flowId);
  }

  getSnapshot(companyId: string, flowId: string): Readonly<SimulationSnapshot> {
    return this.repository.getSnapshot(companyId, flowId);
  }

  getPendingBreakpoints(companyId: string, flowId: string): string[] {
    return this.repository.getPendingBreakpoints(companyId, flowId);
  }

  getSessionDocumentFingerprint(companyId: string, flowId: string): string | null {
    return this.repository.getSession(companyId, flowId)?.documentFingerprint ?? null;
  }

  pauseForDocumentDrift(companyId: string, flowId: string): Readonly<SimulationSnapshot> {
    const session = this.repository.getSession(companyId, flowId);
    if (!session) return this.getSnapshot(companyId, flowId);
    if (session.status !== "running") return this.getSnapshot(companyId, flowId);
    session.status = "paused";
    this.appendTimeline(
      session,
      "session_paused",
      session.currentNodeId,
      "Workflow has changed. Restart simulation?",
    );
    return this.persistSnapshot(companyId, flowId);
  }

  start(document: WorkflowDocument, options: SimulationStartOptions = {}): Readonly<SimulationSnapshot> {
    const validationIssues = this.initializeSession(document, options);
    const { companyId, flowId } = document;
    this.runUntilPause(companyId, flowId, validationIssues);
    return this.persistSnapshot(companyId, flowId, validationIssues);
  }

  async startCooperative(
    document: WorkflowDocument,
    options: SimulationStartOptions = {},
  ): Promise<Readonly<SimulationSnapshot>> {
    const validationIssues = this.initializeSession(document, options);
    const { companyId, flowId } = document;
    const initialSnapshot = this.persistSnapshot(companyId, flowId, validationIssues);
    options.onProgress?.(initialSnapshot);
    await this.runUntilPauseCooperative(companyId, flowId, validationIssues, options.onProgress);
    return this.persistSnapshot(companyId, flowId, validationIssues);
  }

  pause(companyId: string, flowId: string): Readonly<SimulationSnapshot> {
    const session = this.repository.getSession(companyId, flowId);
    if (!session || session.status !== "running") return this.getSnapshot(companyId, flowId);
    session.status = "paused";
    this.appendTimeline(session, "session_paused", session.currentNodeId, "Simulation paused");
    return this.persistSnapshot(companyId, flowId);
  }

  resume(
    companyId: string,
    flowId: string,
    options: SimulationResumeOptions = {},
  ): Readonly<SimulationSnapshot> {
    const session = this.repository.getSession(companyId, flowId);
    if (!session) return this.getSnapshot(companyId, flowId);
    if (session.status !== "paused" && session.status !== "waiting_input") return this.getSnapshot(companyId, flowId);

    if (session.status === "waiting_input" && session.currentNodeId) {
      const node = findNodeById(session.currentNodeId, session.nodes);
      session.pendingSimulatedInput =
        options.simulatedInput ?? buildDefaultSimulatedInput(node, session.variables);
    }

    session.status = "running";
    this.appendTimeline(session, "session_resumed", session.currentNodeId, "Simulation resumed");
    this.runUntilPause(companyId, flowId);
    return this.persistSnapshot(companyId, flowId);
  }

  async resumeCooperative(
    companyId: string,
    flowId: string,
    options: SimulationResumeOptions = {},
  ): Promise<Readonly<SimulationSnapshot>> {
    const session = this.repository.getSession(companyId, flowId);
    if (!session) return this.getSnapshot(companyId, flowId);
    if (session.status !== "paused" && session.status !== "waiting_input") return this.getSnapshot(companyId, flowId);

    if (session.status === "waiting_input" && session.currentNodeId) {
      const node = findNodeById(session.currentNodeId, session.nodes);
      session.pendingSimulatedInput =
        options.simulatedInput ?? buildDefaultSimulatedInput(node, session.variables);
    }

    session.status = "running";
    this.appendTimeline(session, "session_resumed", session.currentNodeId, "Simulation resumed");
    options.onProgress?.(this.persistSnapshot(companyId, flowId));
    await this.runUntilPauseCooperative(companyId, flowId, undefined, options.onProgress);
    return this.persistSnapshot(companyId, flowId);
  }

  restart(
    companyId: string,
    flowId: string,
    document: WorkflowDocument,
    options: SimulationStartOptions = {},
  ): Readonly<SimulationSnapshot> {
    const session = this.repository.getSession(companyId, flowId);
    const breakpoints =
      options.breakpoints ??
      (session ? [...session.breakpoints] : this.repository.getPendingBreakpoints(companyId, flowId));
    this.repository.setSession(companyId, flowId, null);
    return this.start(document, { ...options, breakpoints });
  }

  async restartCooperative(
    companyId: string,
    flowId: string,
    document: WorkflowDocument,
    options: SimulationStartOptions = {},
  ): Promise<Readonly<SimulationSnapshot>> {
    const session = this.repository.getSession(companyId, flowId);
    const breakpoints =
      options.breakpoints ??
      (session ? [...session.breakpoints] : this.repository.getPendingBreakpoints(companyId, flowId));
    this.repository.setSession(companyId, flowId, null);
    return this.startCooperative(document, { ...options, breakpoints });
  }

  stop(companyId: string, flowId: string): Readonly<SimulationSnapshot> {
    const session = this.repository.getSession(companyId, flowId);
    if (!session) return this.getSnapshot(companyId, flowId);
    session.status = "stopped";
    session.finishedAt = new Date().toISOString();
    this.appendTimeline(session, "session_stopped", session.currentNodeId, "Simulation stopped");
    const snapshot = this.repository.saveSnapshot(
      companyId,
      flowId,
      this.buildSnapshot(session, validateWorkflow(session.document)),
    );
    this.repository.disposeScope(companyId, flowId);
    return snapshot;
  }

  step(companyId: string, flowId: string): Readonly<SimulationSnapshot> {
    const session = this.repository.getSession(companyId, flowId);
    if (!session) return this.getSnapshot(companyId, flowId);
    const previousStatus = session.status;
    session.status = "running";

    if (previousStatus === "waiting_input" && session.currentNodeId) {
      const node = findNodeById(session.currentNodeId, session.nodes);
      session.pendingSimulatedInput = buildDefaultSimulatedInput(node, session.variables);
    }

    this.executeSingleStep(session, validateWorkflow(session.document), { skipBreakpoints: true });

    if (previousStatus === "paused" && session.status === "running") {
      session.status = "paused";
    }

    return this.persistSnapshot(companyId, flowId);
  }

  toggleBreakpoint(companyId: string, flowId: string, nodeId: string): Readonly<SimulationSnapshot> {
    const session = this.repository.getSession(companyId, flowId);
    if (!session) {
      this.repository.togglePendingBreakpoint(companyId, flowId, nodeId);
      const idle = createIdleSimulationSnapshot(companyId, flowId);
      return this.repository.saveSnapshot(companyId, flowId, {
        ...idle,
        breakpoints: this.repository.getPendingBreakpoints(companyId, flowId),
      });
    }

    if (session.breakpoints.has(nodeId)) session.breakpoints.delete(nodeId);
    else session.breakpoints.add(nodeId);
    return this.persistSnapshot(companyId, flowId);
  }

  private initializeSession(
    document: WorkflowDocument,
    options: SimulationStartOptions,
  ): ReturnType<typeof validateWorkflow> {
    const { companyId, flowId } = document;
    const validationIssues = validateWorkflow(document);
    const graphSnapshot = documentToSnapshot(document);
    const graph = snapshotToRuntimeGraph(graphSnapshot);
    const flowGraph = loadFlowGraph(graph.nodes, graph.edges);
    const breakpoints = options.breakpoints ?? this.repository.getPendingBreakpoints(companyId, flowId);

    const session: SimulationInternalSession = {
      sessionId: `sim-${Date.now()}`,
      companyId,
      flowId,
      documentFingerprint: computeWorkflowDocumentFingerprint(document),
      status: "running",
      document: structuredClone(document),
      nodes: graph.nodes,
      edges: graph.edges,
      currentNodeId: flowGraph.startNode.id,
      variables: createInitialSimulationVariables(options.initialVariables),
      variableMutations: [],
      executedNodeIds: [],
      skippedNodeIds: [],
      timeline: [],
      logs: [],
      outputs: {},
      breakpoints: new Set(breakpoints),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      autoAdvance: options.autoAdvance !== false,
      pendingSimulatedInput: null,
    };

    this.repository.setSession(companyId, flowId, session);
    this.appendTimeline(session, "session_started", null, "Simulation session started");
    return validationIssues;
  }

  private runUntilPause(
    companyId: string,
    flowId: string,
    validationIssues?: ReturnType<typeof validateWorkflow>,
  ) {
    const session = this.repository.getSession(companyId, flowId);
    if (!session) return;
    const issues = validationIssues ?? validateWorkflow(session.document);
    while (session.status === "running") {
      const shouldContinue = this.executeSingleStep(session, issues);
      if (!shouldContinue || !session.autoAdvance) break;
    }
  }

  private async runUntilPauseCooperative(
    companyId: string,
    flowId: string,
    validationIssues?: ReturnType<typeof validateWorkflow>,
    onProgress?: (snapshot: Readonly<SimulationSnapshot>) => void,
  ) {
    const session = this.repository.getSession(companyId, flowId);
    if (!session) return;
    const issues = validationIssues ?? validateWorkflow(session.document);

    while (session.status === "running") {
      let stepsInBatch = 0;
      while (session.status === "running" && stepsInBatch < SIMULATION_STEP_BATCH_SIZE) {
        const shouldContinue = this.executeSingleStep(session, issues);
        stepsInBatch += 1;
        if (!shouldContinue || !session.autoAdvance) break;
      }

      onProgress?.(this.persistSnapshot(companyId, flowId, issues));

      if (session.status !== "running" || !session.autoAdvance) break;
      await yieldToMainThread();
    }
  }

  private executeSingleStep(
    session: SimulationInternalSession,
    validationIssues: ReturnType<typeof validateWorkflow>,
    options: { skipBreakpoints?: boolean } = {},
  ): boolean {
    if (!session.currentNodeId) return false;

    const node = findNodeById(session.currentNodeId, session.nodes);

    if (!options.skipBreakpoints && session.breakpoints.has(node.id) && session.status === "running") {
      session.status = "paused";
      this.appendTimeline(session, "breakpoint_hit", node.id, `Breakpoint hit on ${readBuilderNodeLabel(node)}`);
      return false;
    }

    const isWaitingResume = session.pendingSimulatedInput != null;
    if (!isWaitingResume) {
      this.appendTimeline(session, "node_entered", node.id, `Entered ${readBuilderNodeLabel(node)}`);
    }

    const mockResult = executeSimulationNode(node, session.variables, {
      simulatedInput: session.pendingSimulatedInput ?? undefined,
    });
    session.pendingSimulatedInput = null;

    if (mockResult.result.outcome === "failed") {
      session.status = "failed";
      session.finishedAt = new Date().toISOString();
      this.appendTimeline(session, "node_exited", node.id, mockResult.result.errorMessage ?? "Node failed");
      return false;
    }

    const timestamp = new Date().toISOString();
    const patchResult = applyVariablePatch({
      current: session.variables,
      patch: mockResult.result.variables,
      nodeId: node.id,
      timestamp,
    });
    session.variables = patchResult.variables;
    session.variableMutations.push(...patchResult.mutations);

    for (const mutation of patchResult.mutations) {
      this.appendTimeline(
        session,
        "variable_changed",
        node.id,
        `${mutation.key}: ${formatValue(mutation.previousValue)} → ${formatValue(mutation.currentValue)}`,
      );
    }

    if (mockResult.branch) {
      this.recordBranchSelection(session, node, mockResult.branch);
      this.appendTimeline(session, "branch_selected", node.id, `Branch "${mockResult.branch}" selected`);
    }
    if (mockResult.switchCase) {
      this.recordBranchSelection(session, node, mockResult.switchCase, true);
      this.appendTimeline(session, "decision_taken", node.id, `Switch case "${mockResult.switchCase}" selected`);
    }
    if (mockResult.decisionLabel) {
      this.appendTimeline(session, "decision_taken", node.id, mockResult.decisionLabel);
    }

    session.outputs = { ...session.outputs, [node.id]: mockResult.outputs };
    if (!session.executedNodeIds.includes(node.id)) session.executedNodeIds.push(node.id);

    this.appendTimeline(session, "node_exited", node.id, `Exited ${readBuilderNodeLabel(node)}`);

    if (mockResult.result.outcome === "waiting_input") {
      session.status = "waiting_input";
      return false;
    }

    if (mockResult.result.outcome === "completed" || node.type === "end") {
      session.status = "completed";
      session.currentNodeId = null;
      session.finishedAt = new Date().toISOString();
      this.appendTimeline(session, "session_completed", node.id, "Simulation completed");
      return false;
    }

    const nextNodeId = resolveNextNodeId(node, { edges: session.edges }, session.variables);
    if (!nextNodeId) {
      session.status = "completed";
      session.currentNodeId = null;
      session.finishedAt = new Date().toISOString();
      this.appendTimeline(session, "session_completed", node.id, "Simulation reached terminal path");
      return false;
    }

    session.currentNodeId = nextNodeId;
    return true;
  }

  private recordBranchSelection(
    session: SimulationInternalSession,
    node: AutomationNodeRecord,
    selectedBranch: string,
    isSwitch = false,
  ) {
    const outgoing = session.edges.filter((edge) => edge.source_node_id === node.id);
    for (const edge of outgoing) {
      const branch = isSwitch
        ? (edge.condition?.case as string | undefined) ?? readConditionBranch(edge.condition)
        : readConditionBranch(edge.condition);
      if (branch && branch !== selectedBranch && !session.skippedNodeIds.includes(edge.target_node_id)) {
        session.skippedNodeIds.push(edge.target_node_id);
      }
    }

    if (node.type === "condition") {
      const diagnostic = diagnoseConditionEdgeResolution(node, session.edges, session.variables);
      for (const edge of diagnostic.outgoingEdges) {
        if (!edge.matchesRequestedBranch && edge.targetNodeId && !session.skippedNodeIds.includes(edge.targetNodeId)) {
          session.skippedNodeIds.push(edge.targetNodeId);
        }
      }
    }
  }

  private appendTimeline(
    session: SimulationInternalSession,
    type: SimulationTimelineEntry["type"],
    nodeId: string | null,
    label: string,
    detail?: string,
  ) {
    const entry = createTimelineEntry(type, nodeId, label, detail);
    session.timeline.push(entry);
    session.logs.push(entry);
  }

  private persistSnapshot(
    companyId: string,
    flowId: string,
    validationIssues = validateWorkflow(this.repository.getSession(companyId, flowId)?.document ?? emptyDocument()),
  ): Readonly<SimulationSnapshot> {
    const session = this.repository.getSession(companyId, flowId);
    if (!session) return this.repository.getSnapshot(companyId, flowId);
    const snapshot = this.repository.saveSnapshot(
      companyId,
      flowId,
      this.buildSnapshot(session, validationIssues),
    );
    if (session.status === "completed" || session.status === "failed") {
      this.repository.setSession(companyId, flowId, null);
    }
    return snapshot;
  }

  private buildSnapshot(
    session: SimulationInternalSession,
    validationIssues: ReturnType<typeof validateWorkflow>,
  ): SimulationSnapshot {
    const durationMs =
      session.startedAt && session.finishedAt
        ? new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()
        : session.startedAt
          ? Date.now() - new Date(session.startedAt).getTime()
          : null;

    const simulationErrors = buildSimulationErrors({
      validationIssues,
      nodes: session.nodes,
      edges: session.edges,
      variables: session.variables,
      executedNodeIds: session.executedNodeIds,
    });

    const pathExplorer = buildPathExplorer({
      nodes: session.nodes,
      executedNodeIds: session.executedNodeIds,
      skippedNodeIds: session.skippedNodeIds,
      currentNodeId: session.currentNodeId,
      breakpoints: [...session.breakpoints],
    });

    const currentNode = session.currentNodeId ? findNodeById(session.currentNodeId, session.nodes) : null;

    const report =
      session.status === "completed" || session.status === "failed" || session.status === "stopped"
        ? buildSimulationReport({
            durationMs: durationMs ?? 0,
            nodes: session.nodes,
            executedNodeIds: session.executedNodeIds,
            skippedNodeIds: session.skippedNodeIds,
            validationIssues,
            simulationErrors,
            timeline: session.timeline,
            variables: session.variables,
          })
        : null;

    return {
      sessionId: session.sessionId,
      companyId: session.companyId,
      flowId: session.flowId,
      status: session.status,
      currentNodeId: session.currentNodeId,
      variables: session.variables,
      variableMutations: [...session.variableMutations],
      pathExplorer,
      timeline: [...session.timeline],
      logs: [...session.logs],
      validationIssues,
      simulationErrors,
      stateInspector: {
        currentNode: currentNode
          ? { id: currentNode.id, type: currentNode.type, label: readBuilderNodeLabel(currentNode) }
          : null,
        workflowState: session.status,
        executionContext: {
          variableCount: Object.keys(session.variables).length,
          executedSteps: session.executedNodeIds.length,
          waitingFor: session.variables.__waitingFor ?? null,
        },
        outputs: { ...session.outputs },
      },
      report,
      breakpoints: [...session.breakpoints],
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      durationMs,
    };
  }
}

function formatValue(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function emptyDocument(): WorkflowDocument {
  return {
    flowId: "",
    companyId: "",
    name: "",
    description: "",
    triggerType: "inbound_message",
    status: "draft",
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
