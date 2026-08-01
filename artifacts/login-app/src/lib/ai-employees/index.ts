import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AiEmployeeRepository } from "@/lib/ai-employees/repositories";
import { AiEmployeeLifecycleRepository } from "@/lib/ai-employees/repositories/ai-employee-lifecycle-repository";
import { AiEmployeeOperationsRepository } from "@/lib/ai-employees/repositories/ai-employee-operations-repository";
import { AiEmployeeMemoryRepository } from "@/lib/ai-employees/repositories/ai-employee-memory-repository";
import { AiEmployeeSkillRepository } from "@/lib/ai-employees/repositories/ai-employee-skill-repository";
import { AiEmployeeCollaborationRepository } from "@/lib/ai-employees/repositories/ai-employee-collaboration-repository";
import { AiEmployeeGovernanceRepository } from "@/lib/ai-employees/repositories/ai-employee-governance-repository";
import {
  AiEmployeeCollaborationService,
  AiEmployeeAdministrationService,
  AiEmployeeConfigurationService,
  AiEmployeeGovernanceService,
  AiEmployeeLifecycleService,
  AiEmployeeMemoryService,
  AiEmployeeOperationsService,
  AiEmployeeRegistryService,
  AiEmployeeSkillService,
} from "@/lib/ai-employees/services";

export function createAiEmployeeServices(client: SupabaseClient = supabase) {
  const repository = new AiEmployeeRepository(client);
  const lifecycleRepository = new AiEmployeeLifecycleRepository(client);
  const operationsRepository = new AiEmployeeOperationsRepository(client);
  const memoryRepository = new AiEmployeeMemoryRepository(client);
  const skillRepository = new AiEmployeeSkillRepository(client);
  const collaborationRepository = new AiEmployeeCollaborationRepository(client);
  const governanceRepository = new AiEmployeeGovernanceRepository(client);
  const registry = new AiEmployeeRegistryService(repository);
  const skills = new AiEmployeeSkillService(skillRepository, repository);
  const configuration = new AiEmployeeConfigurationService(registry, repository, lifecycleRepository, skills);
  const lifecycle = new AiEmployeeLifecycleService(registry, repository, lifecycleRepository, configuration);
  const operations = new AiEmployeeOperationsService(operationsRepository, lifecycle, registry);
  const memory = new AiEmployeeMemoryService(memoryRepository);
  const collaboration = new AiEmployeeCollaborationService(
    collaborationRepository,
    memoryRepository,
    lifecycleRepository,
    registry,
  );
  const governance = new AiEmployeeGovernanceService(governanceRepository, repository, skillRepository, registry);
  const administration = new AiEmployeeAdministrationService(
    registry,
    operations,
    memory,
    skills,
    collaboration,
    governance,
  );
  return {
    registry,
    configuration,
    lifecycle,
    operations,
    memory,
    skills,
    collaboration,
    governance,
    administration,
    repositories: {
      employees: repository,
      lifecycle: lifecycleRepository,
      operations: operationsRepository,
      memory: memoryRepository,
      skills: skillRepository,
      collaboration: collaborationRepository,
      governance: governanceRepository,
    },
  };
}

let cached: ReturnType<typeof createAiEmployeeServices> | null = null;

export function getAiEmployeeServices(client: SupabaseClient = supabase) {
  if (!cached) {
    cached = createAiEmployeeServices(client);
  }
  return cached;
}

export {
  AiEmployeeRepository,
  AiEmployeeLifecycleRepository,
  AiEmployeeOperationsRepository,
  AiEmployeeMemoryRepository,
  AiEmployeeSkillRepository,
  AiEmployeeCollaborationRepository,
  AiEmployeeGovernanceRepository,
  AiEmployeeRegistryService,
  AiEmployeeConfigurationService,
  AiEmployeeLifecycleService,
  AiEmployeeOperationsService,
  AiEmployeeMemoryService,
  AiEmployeeSkillService,
  AiEmployeeCollaborationService,
  AiEmployeeGovernanceService,
  AiEmployeeAdministrationService,
};
export { resolveEmployeeChannelRuntime, evaluateEmployeeChannelRuntimeBinding } from "./services";
