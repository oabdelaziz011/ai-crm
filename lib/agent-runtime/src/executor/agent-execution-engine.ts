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
  AgentWorkflowResult,
  ServiceContext,
  StartAgentWorkflowInput,
} from "../types.js";
import type { AgentWorkflowRepository, CheckpointSnapshot } from "../checkpoint/checkpoint-service.js";
import { createInitialMemory } from "../memory/agent-memory.js";
import {
  assertAgentsExecuteAccess,
  assertAgentsReadAccess,
} from "../utils/agents-guards.js";

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

    const workflowId = crypto.randomUUID();
    const correlationId = input.correlationId ?? crypto.randomUUID();

    await this.publish(ctx, input.companyId, workflowId, "PlanningStarted", null, { goal: input.goal });

    const taskGraph = this.planner.plan({
      workflowId,
      goal: input.goal,
      pageContext: input.pageContext,
    });

    const memory = createInitialMemory(input.goal, taskGraph);
    memory.executionState = {
      ...memory.executionState,
      agentType: taskGraph.agentType ?? input.agentType ?? "generic",
      startedAt: new Date().toISOString(),
      pageContext: input.pageContext ?? {},
    };

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
      error_message: null,
      final_report: null,
    });

    return this.runUntilBlocked(ctx, workflow.id);
  }

  async resume(ctx: ServiceContext, workflowId: string): Promise<AgentWorkflowResult> {
    assertAgentsExecuteAccess(ctx);
    const workflow = await this.repo.getWorkflow(workflowId);
    if (!workflow) throw new Error("Workflow not found.");
    assertTenantAccess(ctx, workflow.company_id);

    if (workflow.status === "waiting_user" || workflow.status === "paused") {
      await this.repo.updateWorkflow(workflowId, { status: "running" });
    }

    return this.runUntilBlocked(ctx, workflowId);
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

  async runUntilBlocked(ctx: ServiceContext, workflowId: string): Promise<AgentWorkflowResult> {
    let workflow = (await this.repo.getWorkflow(workflowId))!;
    assertTenantAccess(ctx, workflow.company_id);

    let graph: AgentTaskGraph = workflow.task_graph;
    let memory = workflow.memory;

    while (true) {
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

    return {
      workflowId,
      status: final.status,
      finalReport: final.final_report,
      taskGraph: final.task_graph,
      events,
    };
  }

  private async executeTask(
    ctx: ServiceContext,
    workflow: {
      id: string;
      company_id: string;
      conversation_id: string | null;
      goal: string;
      memory: AgentMemoryState;
    },
    graph: AgentTaskGraph,
    taskId: string,
  ): Promise<void> {
    const task = graph.nodes.find((n) => n.id === taskId);
    if (!task) return;

    let currentGraph = updateNodeStatus(graph, taskId, "running");
    await this.repo.updateWorkflow(workflow.id, { task_graph: currentGraph });

    await this.publish(ctx, workflow.company_id, workflow.id, "TaskStarted", taskId, { title: task.title });

    try {
      let output: Record<string, unknown> | null = null;

      if (task.tool && workflow.conversation_id) {
        const routeResult = await this.ports.toolRouter.route(ctx, {
          conversationId: workflow.conversation_id,
          toolKey: task.tool,
          input: { ...task.toolInput, goal: workflow.goal, taskId },
        });

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
        const memory = recordTaskOutput(workflow.memory, taskId, output);
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

      const memory = recordTaskOutput(workflow.memory, taskId, output);
      currentGraph = updateNodeStatus(currentGraph, taskId, "verified", { result: output });
      await this.repo.updateWorkflow(workflow.id, {
        task_graph: currentGraph,
        memory: mergeExecutionState(memory, { progress: graphProgress(currentGraph) }),
      });

      await this.publish(ctx, workflow.company_id, workflow.id, "TaskCompleted", taskId, { output });
    } catch (error) {
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

  private async saveCheckpoint(
    workflow: {
      id: string;
      company_id: string;
      checkpoint_index: number;
      status: string;
      task_graph: AgentTaskGraph;
      memory: AgentMemoryState;
    },
    graph: AgentTaskGraph,
    memory: AgentMemoryState,
  ): Promise<void> {
    const index = workflow.checkpoint_index + 1;
    const snapshot: CheckpointSnapshot = {
      taskGraph: graph,
      memory,
      status: workflow.status as CheckpointSnapshot["status"],
    };
    await this.repo.saveCheckpoint(workflow.id, workflow.company_id, index, snapshot as unknown as Record<string, unknown>);
    await this.repo.updateWorkflow(workflow.id, { checkpoint_index: index });
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

  resume(ctx: ServiceContext, workflowId: string) {
    return this.engine.resume(ctx, workflowId);
  }

  getWorkflow(ctx: ServiceContext, workflowId: string) {
    return this.engine.getWorkflow(ctx, workflowId);
  }

  listWorkflows(ctx: ServiceContext, companyId: string, limit?: number) {
    return this.engine.listWorkflows(ctx, companyId, limit);
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
