import type {
  AgentRuntimeServices,
  AgentWorkflowEventRecord,
  ServiceContext,
} from "@workspace/agent-runtime";
import type { AgentRuntimeConfiguration } from "@/lib/ai-employees/adapters";
import type { AiEmployeeRecord } from "@/lib/ai-employees/types";
import type { AiEmployeeMemorySnapshot } from "@/lib/ai-employees/types/memory-types";
import { buildMemorySnapshot } from "@/lib/ai-employees/selectors/memory-selectors";
import type { AiEmployeeMemoryRepository } from "@/lib/ai-employees/repositories/ai-employee-memory-repository";
import { filterWorkflowsForEmployee } from "@/lib/ai-employees/selectors/operations-selectors";

export class AiEmployeeMemoryService {
  constructor(private readonly memoryRepository: AiEmployeeMemoryRepository) {}

  async loadSnapshot(
    ctx: ServiceContext,
    runtime: AgentRuntimeServices["runtime"],
    employee: AiEmployeeRecord,
    preview: AgentRuntimeConfiguration | null,
  ): Promise<AiEmployeeMemorySnapshot> {
    const companyId = ctx.companyId;
    if (!companyId) {
      throw new Error("Company required");
    }

    const workflows = await runtime.listWorkflows(ctx, companyId, 100);
    const employeeWorkflows = filterWorkflowsForEmployee(workflows, employee.id);
    const workflowIds = employeeWorkflows.map((workflow) => workflow.id);
    const conversationIds = [...new Set(employeeWorkflows.map((workflow) => workflow.conversation_id).filter(Boolean))] as string[];

    const [checkpoints, retrievalContexts, retrievalExecutions, messages, events] = await Promise.all([
      this.memoryRepository.listCheckpoints(companyId, workflowIds),
      this.memoryRepository.listRetrievalContexts(companyId),
      this.memoryRepository.listRetrievalExecutions(companyId),
      this.memoryRepository.listMessagesForConversations(conversationIds),
      this.loadWorkflowEvents(ctx, runtime, employeeWorkflows),
    ]);

    return buildMemorySnapshot({
      employee,
      previewPrompt: preview?.prompt.systemPrompt ?? employee.systemPrompt,
      workflows,
      events,
      checkpoints,
      retrievalContexts,
      retrievalExecutions,
      messages,
    });
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
