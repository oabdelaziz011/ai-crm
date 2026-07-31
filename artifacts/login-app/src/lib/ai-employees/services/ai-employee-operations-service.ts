import type {
  AgentWorkflowEventRecord,
  AgentWorkflowRecord,
  AgentRuntimeServices,
  ServiceContext,
} from "@workspace/agent-runtime";
import type { AiEmployeeRecord } from "@/lib/ai-employees/types";
import type { AiEmployeeOperationsSnapshot } from "@/lib/ai-employees/types/operations-types";
import { buildOperationsSnapshot } from "@/lib/ai-employees/selectors/operations-selectors";
import type { AiEmployeeOperationsRepository } from "@/lib/ai-employees/repositories/ai-employee-operations-repository";
import type { AiEmployeeLifecycleService } from "./ai-employee-lifecycle-service";
import type { AiEmployeeRegistryService } from "./ai-employee-registry-service";

export class AiEmployeeOperationsService {
  constructor(
    private readonly operationsRepository: AiEmployeeOperationsRepository,
    private readonly lifecycle: AiEmployeeLifecycleService,
    private readonly registry: AiEmployeeRegistryService,
  ) {}

  async loadSnapshot(
    ctx: ServiceContext,
    runtime: AgentRuntimeServices["runtime"],
    employee: AiEmployeeRecord,
  ): Promise<AiEmployeeOperationsSnapshot> {
    const companyId = ctx.companyId;
    if (!companyId) {
      throw new Error("Company required");
    }

    const [workflows, toolExecutions, retrievalExecutions, usageRows, backgroundTasks] = await Promise.all([
      runtime.listWorkflows(ctx, companyId, 100),
      this.operationsRepository.listToolExecutions(companyId),
      this.operationsRepository.listRetrievalExecutions(companyId),
      this.operationsRepository.listPlatformUsage(companyId),
      this.operationsRepository.listBackgroundTasks(companyId),
    ]);

    const employeeWorkflows = workflows.filter((workflow) => {
      const pageContext = workflow.memory?.executionState?.pageContext as Record<string, unknown> | undefined;
      return pageContext?.aiEmployeeId === employee.id;
    });

    const events = await this.loadWorkflowEvents(ctx, runtime, employeeWorkflows);

    return buildOperationsSnapshot({
      employee,
      workflows,
      events,
      toolExecutions,
      retrievalExecutions,
      usageRows,
      backgroundTasks,
    });
  }

  async pause(employeeId: string, companyId: string, actorId?: string | null) {
    return this.lifecycle.disable(employeeId, companyId, actorId);
  }

  async resume(employeeId: string, companyId: string, actorId?: string | null) {
    return this.lifecycle.enable(employeeId, companyId, actorId);
  }

  async disable(employeeId: string, companyId: string, actorId?: string | null) {
    return this.lifecycle.disable(employeeId, companyId, actorId);
  }

  async restart(employeeId: string, companyId: string, actorId?: string | null) {
    const employee = await this.registry.getById(employeeId, companyId);
    if (!employee?.currentVersionNumber) {
      throw new Error("No published version to restart");
    }
    return this.lifecycle.rollback({
      employeeId,
      companyId,
      versionNumber: employee.currentVersionNumber,
      actorId,
    });
  }

  private async loadWorkflowEvents(
    ctx: ServiceContext,
    runtime: AgentRuntimeServices["runtime"],
    workflows: AgentWorkflowRecord[],
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
