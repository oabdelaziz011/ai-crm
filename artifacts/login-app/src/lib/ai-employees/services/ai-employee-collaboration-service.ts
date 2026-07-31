import type {
  AgentRuntimeServices,
  AgentWorkflowEventRecord,
  ServiceContext,
} from "@workspace/agent-runtime";
import type { AgentRuntimeConfiguration } from "@/lib/ai-employees/adapters";
import type { AiEmployeeRecord, RequestAiEmployeeHandoverInput } from "@/lib/ai-employees/types";
import type { AiEmployeeCollaborationSnapshot } from "@/lib/ai-employees/types/collaboration-types";
import { buildCollaborationSnapshot, isCollaborationAllowed, mapCollaborationPolicy, mapGroups } from "@/lib/ai-employees/selectors/collaboration-selectors";
import { buildMemorySnapshot } from "@/lib/ai-employees/selectors/memory-selectors";
import { filterWorkflowsForEmployee } from "@/lib/ai-employees/selectors/operations-selectors";
import type { AiEmployeeCollaborationRepository } from "@/lib/ai-employees/repositories/ai-employee-collaboration-repository";
import type { AiEmployeeLifecycleRepository } from "@/lib/ai-employees/repositories/ai-employee-lifecycle-repository";
import type { AiEmployeeMemoryRepository } from "@/lib/ai-employees/repositories/ai-employee-memory-repository";
import type { AiEmployeeRegistryService } from "./ai-employee-registry-service";
import { AiEmployeeCollaborationError } from "./ai-employee-collaboration-errors";

export class AiEmployeeCollaborationService {
  constructor(
    private readonly collaboration: AiEmployeeCollaborationRepository,
    private readonly memory: AiEmployeeMemoryRepository,
    private readonly lifecycle: AiEmployeeLifecycleRepository,
    private readonly registry: AiEmployeeRegistryService,
  ) {}

  async loadSnapshot(
    ctx: ServiceContext,
    runtime: AgentRuntimeServices["runtime"],
    employee: AiEmployeeRecord,
    preview: AgentRuntimeConfiguration | null,
  ): Promise<AiEmployeeCollaborationSnapshot> {
    const companyId = ctx.companyId;
    if (!companyId) {
      throw new Error("Company required");
    }

    const [employees, groupRows, members, handoverRows, collaborationEvents, lifecycleEvents, policy, humanEscalations] =
      await Promise.all([
        this.registry.list(companyId),
        this.collaboration.ensureDefaultGroups(companyId),
        this.collaboration.listGroupMembers(companyId),
        this.collaboration.listHandovers(companyId, employee.id),
        this.collaboration.listCollaborationEvents(companyId, employee.id),
        this.lifecycle.listChangeEvents(employee.id, companyId),
        this.collaboration.ensureDefaultPolicy(companyId),
        this.collaboration.listHumanEscalations(companyId),
      ]);

    await this.autoAssignGroups(companyId, employees, groupRows);

    const refreshedMembers = await this.collaboration.listGroupMembers(companyId);
    const groups = mapGroups(groupRows, refreshedMembers);

    const workflows = await runtime.listWorkflows(ctx, companyId, 100);
    const employeeWorkflows = filterWorkflowsForEmployee(workflows, employee.id);
    const workflowIds = employeeWorkflows.map((workflow) => workflow.id);
    const conversationIds = [
      ...new Set(employeeWorkflows.map((workflow) => workflow.conversation_id).filter(Boolean)),
    ] as string[];

    const [checkpoints, retrievalContexts, retrievalExecutions, messages, workflowEvents] = await Promise.all([
      this.memory.listCheckpoints(companyId, workflowIds),
      this.memory.listRetrievalContexts(companyId),
      this.memory.listRetrievalExecutions(companyId),
      this.memory.listMessagesForConversations(conversationIds),
      this.loadWorkflowEvents(ctx, runtime, employeeWorkflows),
    ]);

    const memorySnapshot = buildMemorySnapshot({
      employee,
      previewPrompt: preview?.prompt.systemPrompt ?? employee.systemPrompt,
      workflows,
      events: workflowEvents,
      checkpoints,
      retrievalContexts,
      retrievalExecutions,
      messages,
    });

    const operationsHealthById = new Map<string, number>(
      employees.map((entry) => [
        entry.id,
        entry.status === "published" ? 85 : entry.status === "draft" ? 50 : 30,
      ]),
    );

    return buildCollaborationSnapshot({
      employee,
      employees,
      groups,
      handoverRows,
      collaborationEvents,
      lifecycleEvents,
      workflowEvents,
      workflows,
      longTermMemory: memorySnapshot.longTerm,
      humanEscalations,
      policy,
      operationsHealthById,
    });
  }

  async requestHandover(input: RequestAiEmployeeHandoverInput) {
    const [source, destination, policyRow] = await Promise.all([
      this.registry.getById(input.sourceEmployeeId, input.companyId),
      this.registry.getById(input.destinationEmployeeId, input.companyId),
      this.collaboration.ensureDefaultPolicy(input.companyId),
    ]);

    if (!source || !destination) {
      throw new AiEmployeeCollaborationError("Agent not found", "not_found");
    }

    const policy = mapCollaborationPolicy(policyRow);

    if (!isCollaborationAllowed(policy, source.department, destination.department)) {
      throw new AiEmployeeCollaborationError("Collaboration blocked by policy", "policy");
    }

    const handover = await this.collaboration.createHandover({
      companyId: input.companyId,
      sourceEmployeeId: input.sourceEmployeeId,
      destinationEmployeeId: input.destinationEmployeeId,
      reason: input.reason,
      escalationType: input.escalationType ?? "ai_to_ai",
      actorId: input.actorId,
    });

    await this.collaboration.recordCollaborationEvent({
      companyId: input.companyId,
      employeeId: input.sourceEmployeeId,
      eventType: "handover_requested",
      metadata: {
        handoverId: handover.id,
        destinationEmployeeId: input.destinationEmployeeId,
        reason: input.reason,
      },
      actorId: input.actorId,
    });

    return handover;
  }

  private async autoAssignGroups(
    companyId: string,
    employees: AiEmployeeRecord[],
    groups: Awaited<ReturnType<AiEmployeeCollaborationRepository["listGroups"]>>,
  ) {
    for (const employee of employees) {
      const department = employee.department?.toLowerCase() ?? "";
      const matchingGroup = groups.find((group) => group.department?.toLowerCase() === department);
      if (!matchingGroup) continue;

      await this.collaboration.assignEmployeeToGroup({
        companyId,
        groupId: matchingGroup.id,
        employeeId: employee.id,
      });
    }
  }

  private async loadWorkflowEvents(
    ctx: ServiceContext,
    runtime: AgentRuntimeServices["runtime"],
    workflows: Awaited<ReturnType<AgentRuntimeServices["runtime"]["listWorkflows"]>>,
  ): Promise<AgentWorkflowEventRecord[]> {
    const recent = workflows.slice(0, 10);
    const batches = await Promise.all(
      recent.map(async (workflow) => {
        try {
          return await runtime.listEvents(ctx, workflow.id);
        } catch {
          return [];
        }
      }),
    );
    return batches.flat();
  }
}
