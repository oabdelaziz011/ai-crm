import { DEFAULT_MAX_RETRIES, DEFAULT_RETRY_BACKOFF_MS } from "../constants.js";
import { AgentEventPublisher } from "../events/agent-event-publisher.js";
import { recordTaskOutput, mergeExecutionState } from "../memory/agent-memory.js";
import { AgentPlanner } from "../planner/agent-planner.js";
import { buildCrmAgentReport } from "../planner/crm-report-builder.js";
import {
  getRunnableNodes,
  graphProgress,
  hasGraphFailure,
  isGraphComplete,
  updateNodeStatus,
} from "../task-graph/task-graph.js";
import { VerificationService } from "../verification/verification-service.js";
import type {
  AgentRuntimePorts,
  AgentMemoryState,
  AgentTaskGraph,
  AgentWorkflowRecord,
  AgentWorkflowResult,
  ServiceContext,
  StartAgentWorkflowInput,
} from "../types.js";
import type { AgentWorkflowRepository } from "../checkpoint/checkpoint-service.js";
import {
  applyCheckpointSnapshot,
  buildCheckpointSnapshot,
  evaluateMonotonicCheckpoint,
  isRecoverableWorkflowStatus,
  isTaskAlreadyCompleted,
  validateCheckpointSnapshot,
} from "../checkpoint/checkpoint-recovery.js";
import {
  DEFAULT_EXECUTION_LEASE_TTL_MS,
  createRuntimeLeaseHolder,
} from "../checkpoint/workflow-execution-lease.js";
import { AgentCheckpointRecoveryError, AgentExecutionLeaseError } from "../errors.js";
import { createInitialMemory } from "../memory/agent-memory.js";
import {
  assertAgentsExecuteAccess,
  assertAgentsManageAccess,
  assertAgentsReadAccess,
} from "../utils/agents-guards.js";
import { findMissingAlignedPermission } from "../utils/crm-tool-permissions.js";
import { AgentConfirmationError, AgentCrmToolPermissionDeniedError } from "../errors.js";
import { evaluateConfirmationGate, findPendingConfirmationTask, issuePreStartConfirmationTokens } from "../confirmation/confirmation-gate.js";
import { invalidateAllConfirmationTokens } from "../confirmation/confirmation-token.js";
import type { AgentConfirmationRequest, ResumeAgentWorkflowInput } from "../confirmation/confirmation-types.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertTenantAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new Error("Tenant isolation violation: company access denied.");
  }
}

export class AgentExecutionEngine {
  private readonly planner = new AgentPlanner();
  private readonly verification = new VerificationService();
  private readonly events = new AgentEventPublisher();
  private readonly runtimeInstanceId = crypto.randomUUID();

  constructor(
    private readonly repo: AgentWorkflowRepository,
    private readonly ports: AgentRuntimePorts,
  ) {}

  async getWorkflow(ctx: ServiceContext, workflowId: string) {
    assertAgentsReadAccess(ctx);

    const workflow = await this.repo.getWorkflow(workflowId);
    if (!workflow) return null;
    assertTenantAccess(ctx, workflow.company_id);
    return workflow;
  }

  async listWorkflows(ctx: ServiceContext, companyId: string, limit?: number) {
    assertAgentsReadAccess(ctx);
    assertTenantAccess(ctx, companyId);
    return this.repo.listWorkflows(companyId, limit);
  }

  async deleteWorkflow(ctx: ServiceContext, workflowId: string): Promise<boolean> {
    assertAgentsManageAccess(ctx);
    const workflow = await this.repo.getWorkflow(workflowId);
    if (!workflow) return false;
    assertTenantAccess(ctx, workflow.company_id);
    await this.repo.deleteWorkflow(workflowId);
    return true;
  }

  async listEvents(ctx: ServiceContext, workflowId: string) {
    assertAgentsReadAccess(ctx);
    const workflow = await this.repo.getWorkflow(workflowId);
    if (!workflow) return [];
    assertTenantAccess(ctx, workflow.company_id);
    return this.repo.listEvents(workflowId);
  }

  async loadLatestCheckpoint(ctx: ServiceContext, workflowId: string) {
    assertAgentsReadAccess(ctx);
    const workflow = await this.repo.getWorkflow(workflowId);
    if (!workflow) return null;
    assertTenantAccess(ctx, workflow.company_id);
    return this.repo.loadLatestCheckpoint(workflowId);
  }

  subscribeEvents = this.events.subscribe.bind(this.events);

  async start(ctx: ServiceContext, input: StartAgentWorkflowInput): Promise<AgentWorkflowResult> {
    assertAgentsExecuteAccess(ctx);
    assertTenantAccess(ctx, input.companyId);

    if (input.recoverWorkflowId) {
      return this.recover(ctx, input.recoverWorkflowId);
    }

    const workflowId = crypto.randomUUID();
    const correlationId = input.correlationId ?? crypto.randomUUID();

    await this.publish(ctx, input.companyId, workflowId, "PlanningStarted", null, { goal: input.goal });

    const taskGraph = this.planner.plan({
      workflowId,
      goal: input.goal,
      pageContext: input.pageContext,
    });

    let memory = createInitialMemory(input.goal, taskGraph);
    memory.executionState = {
      ...memory.executionState,
      agentType: taskGraph.agentType ?? input.agentType ?? "generic",
      startedAt: new Date().toISOString(),
      pageContext: input.pageContext ?? {},
    };

    if (input.preStartConfirmationAcknowledged) {
      memory = issuePreStartConfirmationTokens({
        ctx,
        workflowId,
        companyId: input.companyId,
        taskGraph,
        memory,
      });
    }

    await this.publish(ctx, input.companyId, workflowId, "PlanningCompleted", null, {
      taskCount: taskGraph.nodes.length,
    });

    const workflow = await this.repo.createWorkflow({
      id: workflowId,
      company_id: input.companyId,
      user_id: input.userId ?? ctx.userId,
      conversation_id: input.conversationId ?? null,
      goal: input.goal,
      status: "running",
      task_graph: taskGraph,
      memory,
      correlation_id: correlationId,
      checkpoint_index: 0,
      execution_lease_holder: null,
      execution_lease_expires_at: null,
      error_message: null,
      final_report: null,
    });

    return this.withExecutionLease(workflow.id, (leaseHolder) =>
      this.runUntilBlocked(ctx, workflow.id, leaseHolder),
    );
  }

  async recover(ctx: ServiceContext, workflowId: string): Promise<AgentWorkflowResult> {
    assertAgentsExecuteAccess(ctx);

    const workflow = await this.repo.getWorkflow(workflowId);
    if (!workflow) throw new Error("Workflow not found.");
    assertTenantAccess(ctx, workflow.company_id);

    if (workflow.status === "cancelled" || workflow.status === "completed") {
      return {
        workflowId,
        status: workflow.status,
        finalReport: workflow.final_report,
        taskGraph: workflow.task_graph,
        events: await this.repo.listEvents(workflowId),
        confirmationRequest: this.resolveConfirmationRequest(workflow.task_graph, workflow.memory),
      };
    }

    if (!isRecoverableWorkflowStatus(workflow.status)) {
      throw new AgentCheckpointRecoveryError(
        "CHECKPOINT_NOT_RECOVERABLE",
        `Workflow status "${workflow.status}" cannot be recovered.`,
      );
    }

    const rawCheckpoint = await this.repo.loadLatestCheckpoint(workflowId);
    if (rawCheckpoint) {
      await this.applyLatestCheckpointIfNeeded(ctx, workflowId, rawCheckpoint);
    }

    if ((await this.repo.getWorkflow(workflowId))!.status === "waiting_user") {
      return this.buildWorkflowResult(workflowId);
    }

    return this.withExecutionLease(
      workflowId,
      async (leaseHolder) => {
        await this.repo.updateWorkflow(workflowId, { status: "running" });
        return this.runUntilBlocked(ctx, workflowId, leaseHolder);
      },
      { onLeaseDenied: () => this.buildWorkflowResult(workflowId) },
    );
  }

  private async withExecutionLease(
    workflowId: string,
    run: (leaseHolder: string) => Promise<AgentWorkflowResult>,
    options?: { onLeaseDenied?: () => Promise<AgentWorkflowResult> },
  ): Promise<AgentWorkflowResult> {
    const holder = createRuntimeLeaseHolder(this.runtimeInstanceId);
    const acquired = await this.repo.tryAcquireExecutionLease(
      workflowId,
      holder,
      DEFAULT_EXECUTION_LEASE_TTL_MS,
    );

    if (!acquired) {
      if (options?.onLeaseDenied) {
        return options.onLeaseDenied();
      }
      throw new AgentExecutionLeaseError(
        "EXECUTION_LEASE_DENIED",
        "Another runtime instance is already executing this workflow.",
      );
    }

    try {
      return await run(holder);
    } finally {
      await this.repo.releaseExecutionLease(workflowId, holder);
    }
  }

  private async applyLatestCheckpointIfNeeded(
    ctx: ServiceContext,
    workflowId: string,
    rawCheckpoint?: Record<string, unknown> | null,
  ): Promise<boolean> {
    const workflow = await this.repo.getWorkflow(workflowId);
    if (!workflow) return false;

    const snapshotRaw = rawCheckpoint ?? (await this.repo.loadLatestCheckpoint(workflowId));
    if (!snapshotRaw) return false;

    const validation = validateCheckpointSnapshot(snapshotRaw, workflowId);
    if (!validation.valid) {
      throw new AgentCheckpointRecoveryError(validation.code, validation.message);
    }

    const lastRecoveredIndex =
      typeof workflow.memory.executionState?.lastRecoveredCheckpointIndex === "number"
        ? workflow.memory.executionState.lastRecoveredCheckpointIndex
        : null;

    const monotonic = evaluateMonotonicCheckpoint({
      snapshotIndex: validation.snapshot.checkpointIndex,
      workflowCheckpointIndex: workflow.checkpoint_index,
      lastRecoveredCheckpointIndex: lastRecoveredIndex,
    });

    if (monotonic.action === "reject") {
      throw new AgentCheckpointRecoveryError(monotonic.code, monotonic.message);
    }
    if (monotonic.action === "skip") {
      return false;
    }

    const restored = applyCheckpointSnapshot(validation.snapshot);
    const recoveredMemory = {
      ...restored.memory,
      executionState: {
        ...restored.memory.executionState,
        lastRecoveredCheckpointIndex: validation.snapshot.checkpointIndex,
        recoveredAt: new Date().toISOString(),
      },
    };

    await this.repo.updateWorkflow(workflowId, {
      task_graph: restored.task_graph,
      memory: recoveredMemory,
      status: restored.status,
      error_message: restored.error_message,
      checkpoint_index: restored.checkpoint_index,
    });

    await this.publish(ctx, workflow.company_id, workflowId, "CheckpointSaved", null, {
      reason: "recovered",
      checkpointIndex: validation.snapshot.checkpointIndex,
      currentTaskId: validation.snapshot.currentTaskId,
    });

    return true;
  }

  private async buildWorkflowResult(workflowId: string): Promise<AgentWorkflowResult> {
    const events = await this.repo.listEvents(workflowId);
    const final = (await this.repo.getWorkflow(workflowId))!;

    return {
      workflowId,
      status: final.status,
      finalReport: final.final_report,
      taskGraph: final.task_graph,
      events,
      confirmationRequest: this.resolveConfirmationRequest(final.task_graph, final.memory),
    };
  }

  async resume(
    ctx: ServiceContext,
    input: string | ResumeAgentWorkflowInput,
  ): Promise<AgentWorkflowResult> {
    assertAgentsExecuteAccess(ctx);
    const workflowId = typeof input === "string" ? input : input.workflowId;
    const confirmationToken = typeof input === "string" ? undefined : input.confirmationToken;

    const workflow = await this.repo.getWorkflow(workflowId);
    if (!workflow) throw new Error("Workflow not found.");
    assertTenantAccess(ctx, workflow.company_id);

    if (workflow.status === "cancelled") {
      throw new AgentConfirmationError(
        "WORKFLOW_CANCELLED",
        "Cannot resume a cancelled workflow.",
      );
    }

    let graph = workflow.task_graph;

    if (confirmationToken) {
      const pendingTask = findPendingConfirmationTask(graph);
      if (!pendingTask) {
        throw new AgentConfirmationError(
          "CONFIRMATION_TOKEN_INVALID",
          "No pending confirmation found for this workflow.",
        );
      }

      graph = updateNodeStatus(graph, pendingTask.id, "pending", {
        toolInput: { ...(pendingTask.toolInput ?? {}), confirmationToken },
        result: null,
        error: null,
      });
      await this.repo.updateWorkflow(workflowId, {
        task_graph: graph,
        status: "running",
        error_message: null,
      });
    } else {
      await this.applyLatestCheckpointIfNeeded(ctx, workflowId);
      const refreshed = (await this.repo.getWorkflow(workflowId))!;
      if (refreshed.status === "waiting_user" || refreshed.status === "paused") {
        await this.repo.updateWorkflow(workflowId, { status: "running" });
      }
    }

    return this.withExecutionLease(
      workflowId,
      (leaseHolder) => this.runUntilBlocked(ctx, workflowId, leaseHolder),
      { onLeaseDenied: () => this.buildWorkflowResult(workflowId) },
    );
  }

  async cancel(ctx: ServiceContext, workflowId: string): Promise<AgentWorkflowResult | null> {
    assertAgentsExecuteAccess(ctx);
    const workflow = await this.repo.getWorkflow(workflowId);
    if (!workflow) return null;
    assertTenantAccess(ctx, workflow.company_id);

    if (workflow.status === "completed" || workflow.status === "cancelled") {
      return {
        workflowId,
        status: workflow.status,
        finalReport: workflow.final_report,
        taskGraph: workflow.task_graph,
        events: await this.repo.listEvents(workflowId),
      };
    }

    await this.repo.updateWorkflow(workflowId, {
      status: "cancelled",
      completed_at: new Date().toISOString(),
      memory: invalidateAllConfirmationTokens(workflow.memory),
    });
    await this.publish(ctx, workflow.company_id, workflowId, "WorkflowPaused", null, {
      reason: "cancelled",
    });

    const final = (await this.repo.getWorkflow(workflowId))!;
    return {
      workflowId,
      status: final.status,
      finalReport: final.final_report,
      taskGraph: final.task_graph,
      events: await this.repo.listEvents(workflowId),
    };
  }

  async runUntilBlocked(
    ctx: ServiceContext,
    workflowId: string,
    leaseHolder?: string,
  ): Promise<AgentWorkflowResult> {
    let workflow = (await this.repo.getWorkflow(workflowId))!;
    assertTenantAccess(ctx, workflow.company_id);

    let graph: AgentTaskGraph = workflow.task_graph;
    let memory = workflow.memory;

    while (true) {
      if (leaseHolder) {
        await this.repo.renewExecutionLease(
          workflowId,
          leaseHolder,
          DEFAULT_EXECUTION_LEASE_TTL_MS,
        );
      }

      const runnable = getRunnableNodes(graph);
      if (runnable.length === 0) break;

      await Promise.all(
        runnable.map((task) => this.executeTask(ctx, workflow, graph, task.id)),
      );

      workflow = (await this.repo.getWorkflow(workflowId))!;
      graph = workflow.task_graph;
      memory = workflow.memory;

      await this.saveCheckpoint(workflow, graph, memory);

      if (workflow.status === "waiting_user" || workflow.status === "paused") {
        break;
      }
    }

    workflow = (await this.repo.getWorkflow(workflowId))!;
    graph = workflow.task_graph;

    if (isGraphComplete(graph)) {
      const report = this.buildFinalReport(graph, memory);
      await this.repo.updateWorkflow(workflowId, {
        status: "completed",
        final_report: report,
        completed_at: new Date().toISOString(),
      });
      await this.publish(ctx, workflow.company_id, workflowId, "WorkflowCompleted", null, { report });
    } else if (hasGraphFailure(graph) && workflow.status !== "waiting_user") {
      await this.repo.updateWorkflow(workflowId, {
        status: "failed",
        error_message: "One or more tasks failed without recovery.",
      });
    }

    const events = await this.repo.listEvents(workflowId);
    const final = (await this.repo.getWorkflow(workflowId))!;
    const confirmationRequest = this.resolveConfirmationRequest(final.task_graph, final.memory);

    return {
      workflowId,
      status: final.status,
      finalReport: final.final_report,
      taskGraph: final.task_graph,
      events,
      confirmationRequest,
    };
  }

  private resolveConfirmationRequest(
    graph: AgentTaskGraph,
    memory: AgentMemoryState,
  ): AgentConfirmationRequest | null {
    const pendingTask = findPendingConfirmationTask(graph);
    if (pendingTask?.result?.confirmationRequest) {
      return pendingTask.result.confirmationRequest as AgentConfirmationRequest;
    }

    const fromMemory = memory.executionState?.pendingConfirmation;
    if (fromMemory && typeof fromMemory === "object") {
      return fromMemory as AgentConfirmationRequest;
    }

    return null;
  }

  private async executeTask(
    ctx: ServiceContext,
    workflow: {
      id: string;
      company_id: string;
      user_id: string | null;
      conversation_id: string | null;
      goal: string;
      memory: AgentMemoryState;
    },
    graph: AgentTaskGraph,
    taskId: string,
  ): Promise<void> {
    const task = graph.nodes.find((n) => n.id === taskId);
    if (!task) return;

    if (isTaskAlreadyCompleted(task)) {
      return;
    }

    let currentGraph = updateNodeStatus(graph, taskId, "running");
    await this.repo.updateWorkflow(workflow.id, { task_graph: currentGraph });

    await this.publish(ctx, workflow.company_id, workflow.id, "TaskStarted", taskId, { title: task.title });

    try {
      let output: Record<string, unknown> | null = null;
      let taskMemory = workflow.memory;

      if (task.tool && workflow.conversation_id) {
        await this.assertToolPermissions(ctx, task.tool);

        const gate = evaluateConfirmationGate({
          ctx,
          workflowId: workflow.id,
          companyId: workflow.company_id,
          workflowUserId: workflow.user_id,
          task,
          memory: workflow.memory,
        });

        if (gate.action === "reject") {
          throw new AgentConfirmationError(gate.code, gate.message);
        }

        if (gate.action === "pause") {
          currentGraph = updateNodeStatus(currentGraph, taskId, "waiting", {
            result: {
              confirmationRequired: true,
              confirmationRequest: gate.request,
              requiresConfirmation: true,
              message: gate.request.summary,
            },
            error: gate.request.summary,
          });
          await this.repo.updateWorkflow(workflow.id, {
            task_graph: currentGraph,
            memory: gate.memory,
            status: "waiting_user",
            error_message: gate.request.summary,
          });
          await this.publish(ctx, workflow.company_id, workflow.id, "WorkflowPaused", taskId, {
            reason: "confirmation_required",
            message: gate.request.summary,
            confirmationRequest: gate.request,
          });
          await this.persistTaskCheckpoint(workflow.id, currentGraph, gate.memory, taskId);
          return;
        }

        const routeResult = await this.ports.toolRouter.route(ctx, {
          conversationId: workflow.conversation_id,
          toolKey: task.tool,
          input: { ...gate.toolInput, goal: workflow.goal, taskId },
        });

        if (gate.memory !== workflow.memory) {
          await this.repo.updateWorkflow(workflow.id, { memory: gate.memory });
        }

        taskMemory = gate.memory;

        if (routeResult.status === "failed") {
          throw new Error(routeResult.errorMessage ?? `Tool ${task.tool} failed`);
        }
        output = routeResult.output;
      } else if (this.ports.runtimeChat && workflow.conversation_id) {
        const response = await this.ports.runtimeChat.execute(ctx, {
          companyId: workflow.company_id,
          conversationId: workflow.conversation_id,
          messageText: `[Agent Task: ${task.title}] ${task.description}\n\nGoal: ${workflow.goal}`,
          pageContext: { agentTaskId: taskId, workflowId: workflow.id },
        });
        output = { response: response.responseContent };
      } else {
        output = { acknowledged: true, task: task.title };
      }

      if (output?.requiresConfirmation) {
        currentGraph = updateNodeStatus(currentGraph, taskId, "waiting", {
          result: output,
          error: String(output.message ?? "Waiting for user confirmation."),
        });
        const memory = recordTaskOutput(taskMemory, taskId, output);
        await this.repo.updateWorkflow(workflow.id, {
          task_graph: currentGraph,
          memory,
          status: "waiting_user",
          error_message: String(output.message ?? "Action requires user confirmation."),
        });
        await this.publish(ctx, workflow.company_id, workflow.id, "WorkflowPaused", taskId, {
          reason: "confirmation_required",
          message: output.message,
        });
        return;
      }

      const verification = this.verification.verify(task, output);
      if (!verification.passed) {
        await this.publish(ctx, workflow.company_id, workflow.id, "VerificationFailed", taskId, {
          message: verification.message,
        });

        const needsConfirmation = Boolean(
          verification.details?.requiresConfirmation || output?.requiresConfirmation,
        );

        if (needsConfirmation || task.retryCount >= task.maxRetries) {
          currentGraph = updateNodeStatus(currentGraph, taskId, needsConfirmation ? "waiting" : "failed", {
            error: verification.message,
            result: output,
          });
          await this.repo.updateWorkflow(workflow.id, {
            task_graph: currentGraph,
            status: "waiting_user",
            error_message: verification.message,
          });
          await this.publish(ctx, workflow.company_id, workflow.id, "TaskFailed", taskId, {
            error: verification.message,
            recoverable: needsConfirmation,
          });
          return;
        }

        if (task.retryCount < task.maxRetries) {
          currentGraph = updateNodeStatus(currentGraph, taskId, "retrying", {
            retryCount: task.retryCount + 1,
          });
          await this.repo.updateWorkflow(workflow.id, { task_graph: currentGraph });
          await sleep(DEFAULT_RETRY_BACKOFF_MS * (task.retryCount + 1));
          currentGraph = updateNodeStatus(currentGraph, taskId, "pending", { retryCount: task.retryCount + 1 });
          await this.repo.updateWorkflow(workflow.id, { task_graph: currentGraph });
          return;
        }

        currentGraph = updateNodeStatus(currentGraph, taskId, "failed", {
          error: verification.message,
          result: output,
        });
        await this.repo.updateWorkflow(workflow.id, {
          task_graph: currentGraph,
          status: "waiting_user",
          error_message: verification.message,
        });
        await this.publish(ctx, workflow.company_id, workflow.id, "TaskFailed", taskId, {
          error: verification.message,
          recoverable: false,
        });
        return;
      }

      await this.publish(ctx, workflow.company_id, workflow.id, "VerificationPassed", taskId, {
        message: verification.message,
      });

      const memory = recordTaskOutput(taskMemory, taskId, output);
      currentGraph = updateNodeStatus(currentGraph, taskId, "verified", { result: output });
      const mergedMemory = mergeExecutionState(memory, { progress: graphProgress(currentGraph) });
      await this.repo.updateWorkflow(workflow.id, {
        task_graph: currentGraph,
        memory: mergedMemory,
      });

      await this.publish(ctx, workflow.company_id, workflow.id, "TaskCompleted", taskId, { output });
      await this.persistTaskCheckpoint(workflow.id, currentGraph, mergedMemory, taskId);
    } catch (error) {
      if (error instanceof AgentConfirmationError) {
        currentGraph = updateNodeStatus(currentGraph, taskId, "waiting", {
          error: error.message,
        });
        await this.repo.updateWorkflow(workflow.id, {
          task_graph: currentGraph,
          status: "waiting_user",
          error_message: error.message,
        });
        await this.publish(ctx, workflow.company_id, workflow.id, "WorkflowPaused", taskId, {
          reason: "confirmation_rejected",
          message: error.message,
          errorCode: error.confirmationCode,
        });
        return;
      }

      if (error instanceof AgentCrmToolPermissionDeniedError) {
        currentGraph = updateNodeStatus(currentGraph, taskId, "failed", {
          error: error.message,
        });
        await this.repo.updateWorkflow(workflow.id, {
          task_graph: currentGraph,
          status: "waiting_user",
          error_message: error.message,
        });
        await this.publish(ctx, workflow.company_id, workflow.id, "TaskFailed", taskId, {
          error: error.message,
          recoverable: false,
          errorCode: error.code,
          missingPermission: error.permission,
        });
        return;
      }

      const message = error instanceof Error ? error.message : String(error);

      if (task.retryCount < (task.maxRetries ?? DEFAULT_MAX_RETRIES)) {
        currentGraph = updateNodeStatus(currentGraph, taskId, "retrying", {
          retryCount: task.retryCount + 1,
        });
        await this.repo.updateWorkflow(workflow.id, { task_graph: currentGraph });
        await sleep(DEFAULT_RETRY_BACKOFF_MS * (task.retryCount + 1));
        currentGraph = updateNodeStatus(currentGraph, taskId, "pending", {
          retryCount: task.retryCount + 1,
        });
        await this.repo.updateWorkflow(workflow.id, { task_graph: currentGraph });
        return;
      }

      currentGraph = updateNodeStatus(currentGraph, taskId, "failed", { error: message });
      await this.repo.updateWorkflow(workflow.id, {
        task_graph: currentGraph,
        status: "waiting_user",
        error_message: message,
      });
      await this.publish(ctx, workflow.company_id, workflow.id, "TaskFailed", taskId, {
        error: message,
        recoverable: true,
      });
    }
  }

  private async assertToolPermissions(ctx: ServiceContext, toolKey: string): Promise<void> {
    const required =
      (await this.ports.toolRouter.getRequiredPermissions?.(toolKey)) ?? null;
    if (!required?.length) return;

    const missing = findMissingAlignedPermission(ctx, required, toolKey);
    if (missing) {
      throw new AgentCrmToolPermissionDeniedError(toolKey, missing);
    }
  }

  private async persistTaskCheckpoint(
    workflowId: string,
    graph: AgentTaskGraph,
    memory: AgentMemoryState,
    currentTaskId: string,
  ): Promise<void> {
    const workflow = await this.repo.getWorkflow(workflowId);
    if (!workflow) return;
    await this.saveCheckpoint(workflow, graph, memory, currentTaskId);
  }

  private async saveCheckpoint(
    workflow: AgentWorkflowRecord,
    graph: AgentTaskGraph,
    memory: AgentMemoryState,
    currentTaskId?: string | null,
  ): Promise<void> {
    const snapshot = buildCheckpointSnapshot({
      workflow,
      taskGraph: graph,
      memory,
      currentTaskId,
    });

    await this.repo.saveCheckpoint(
      workflow.id,
      workflow.company_id,
      snapshot.checkpointIndex,
      snapshot as unknown as Record<string, unknown>,
    );
    await this.repo.updateWorkflow(workflow.id, { checkpoint_index: snapshot.checkpointIndex });
  }

  private buildFinalReport(graph: AgentTaskGraph, memory: import("../types.js").AgentMemoryState): string {
    if (graph.agentType === "crm") {
      const startedAt =
        typeof memory.executionState?.startedAt === "string" ? memory.executionState.startedAt : null;
      return buildCrmAgentReport(graph, memory, startedAt);
    }

    const lines = graph.nodes.map((node) => {
      const status = node.status === "verified" ? "✓" : "○";
      return `${status} ${node.title}${node.error ? ` — ${node.error}` : ""}`;
    });
    return [`Goal: ${memory.goal}`, "", "Tasks:", ...lines, "", `Progress: ${graphProgress(graph)}%`].join("\n");
  }

  private async publish(
    ctx: ServiceContext,
    companyId: string,
    workflowId: string,
    eventType: import("../constants.js").AgentEventType,
    taskId: string | null,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    const record = await this.repo.appendEvent({
      ...AgentEventPublisher.toRecord({
        workflowId,
        companyId,
        eventType,
        taskId,
        payload,
      }),
    });
    this.events.emit(record);
  }
}

export class AgentRuntimeService {
  constructor(private readonly engine: AgentExecutionEngine) {}

  start(ctx: ServiceContext, input: StartAgentWorkflowInput) {
    return this.engine.start(ctx, input);
  }

  recover(ctx: ServiceContext, workflowId: string) {
    return this.engine.recover(ctx, workflowId);
  }

  resume(ctx: ServiceContext, input: string | ResumeAgentWorkflowInput) {
    return this.engine.resume(ctx, input);
  }

  getWorkflow(ctx: ServiceContext, workflowId: string) {
    return this.engine.getWorkflow(ctx, workflowId);
  }

  listWorkflows(ctx: ServiceContext, companyId: string, limit?: number) {
    return this.engine.listWorkflows(ctx, companyId, limit);
  }

  deleteWorkflow(ctx: ServiceContext, workflowId: string) {
    return this.engine.deleteWorkflow(ctx, workflowId);
  }

  listEvents(ctx: ServiceContext, workflowId: string) {
    return this.engine.listEvents(ctx, workflowId);
  }

  loadLatestCheckpoint(ctx: ServiceContext, workflowId: string) {
    return this.engine.loadLatestCheckpoint(ctx, workflowId);
  }

  cancel(ctx: ServiceContext, workflowId: string) {
    return this.engine.cancel(ctx, workflowId);
  }

  subscribeEvents(listener: Parameters<AgentExecutionEngine["subscribeEvents"]>[0]) {
    return this.engine.subscribeEvents(listener);
  }
}
