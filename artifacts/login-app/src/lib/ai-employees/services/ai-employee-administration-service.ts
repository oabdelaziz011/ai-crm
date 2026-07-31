import type {
  AgentRuntimeServices,
  ServiceContext,
} from "@workspace/agent-runtime";
import type { AgentRuntimeConfiguration } from "@/lib/ai-employees/adapters";
import type { AiEmployeeRecord, AiControlTowerSnapshot } from "@/lib/ai-employees/types";
import { buildControlTowerSnapshot } from "@/lib/ai-employees/selectors/administration-selectors";
import type { AiEmployeeCollaborationService } from "./ai-employee-collaboration-service";
import type { AiEmployeeGovernanceService } from "./ai-employee-governance-service";
import type { AiEmployeeMemoryService } from "./ai-employee-memory-service";
import type { AiEmployeeOperationsService } from "./ai-employee-operations-service";
import type { AiEmployeeRegistryService } from "./ai-employee-registry-service";
import type { AiEmployeeSkillService } from "./ai-employee-skill-service";
import type { TenantRuntimeContext } from "./ai-employee-configuration-service";

export class AiEmployeeAdministrationService {
  constructor(
    private readonly registry: AiEmployeeRegistryService,
    private readonly operations: AiEmployeeOperationsService,
    private readonly memory: AiEmployeeMemoryService,
    private readonly skills: AiEmployeeSkillService,
    private readonly collaboration: AiEmployeeCollaborationService,
    private readonly governance: AiEmployeeGovernanceService,
  ) {}

  async loadControlTowerSnapshot(input: {
    ctx: ServiceContext;
    runtime: AgentRuntimeServices["runtime"];
    companyId: string;
    focusEmployee: AiEmployeeRecord;
    preview: AgentRuntimeConfiguration | null;
    tenantRuntime?: TenantRuntimeContext;
  }): Promise<AiControlTowerSnapshot> {
    const { ctx, runtime, companyId, focusEmployee, preview } = input;

    const employees = await this.registry.list(companyId);

    const [operations, memory, skills, collaboration, governance] = await Promise.all([
      this.operations.loadSnapshot(ctx, runtime, focusEmployee).catch(() => null),
      this.memory.loadSnapshot(ctx, runtime, focusEmployee, preview).catch(() => null),
      this.skills
        .loadPlatformSnapshot({
          companyId,
          employee: focusEmployee,
          userId: ctx.userId ?? null,
        })
        .catch(() => null),
      this.collaboration.loadSnapshot(ctx, runtime, focusEmployee, preview).catch(() => null),
      this.governance.loadSnapshot(companyId, focusEmployee).catch(() => null),
    ]);

    return buildControlTowerSnapshot({
      companyId,
      focusEmployee,
      employees,
      operations,
      memory,
      skills,
      collaboration,
      governance,
    });
  }
}
