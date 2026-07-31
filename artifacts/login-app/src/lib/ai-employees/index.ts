import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AiEmployeeRepository } from "@/lib/ai-employees/repositories";
import {
  AiEmployeeConfigurationService,
  AiEmployeeRegistryService,
} from "@/lib/ai-employees/services";

export function createAiEmployeeServices(client: SupabaseClient = supabase) {
  const repository = new AiEmployeeRepository(client);
  const registry = new AiEmployeeRegistryService(repository);
  return {
    registry,
    configuration: new AiEmployeeConfigurationService(registry, repository),
    repositories: { employees: repository },
  };
}

let cached: ReturnType<typeof createAiEmployeeServices> | null = null;

export function getAiEmployeeServices(client: SupabaseClient = supabase) {
  if (!cached) {
    cached = createAiEmployeeServices(client);
  }
  return cached;
}

export { AiEmployeeRepository, AiEmployeeRegistryService, AiEmployeeConfigurationService };
