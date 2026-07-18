import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabasePromptBuildRepository,
  createSupabasePromptTemplateRepository,
  createSupabasePromptTemplateVersionRepository,
} from "./repositories/supabase-prompt-repositories.js";
import { PromptContextService } from "./services/prompt-context-service.js";
import { PromptOrchestratorService } from "./services/prompt-orchestrator-service.js";
import { PromptTemplateService } from "./services/prompt-template-service.js";

export type PromptOrchestratorServices = {
  templates: PromptTemplateService;
  context: PromptContextService;
  orchestrator: PromptOrchestratorService;
};

export function createPromptOrchestratorServices(client: SupabaseClient): PromptOrchestratorServices {
  const templateRepository = createSupabasePromptTemplateRepository(client);
  const versionRepository = createSupabasePromptTemplateVersionRepository(client);
  const buildRepository = createSupabasePromptBuildRepository(client);
  const contextService = new PromptContextService();

  return {
    templates: new PromptTemplateService(templateRepository, versionRepository),
    context: contextService,
    orchestrator: new PromptOrchestratorService(
      templateRepository,
      versionRepository,
      buildRepository,
      contextService,
    ),
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./builders/prompt-builders.js";
export * from "./utils/compose-prompt.js";
export * from "./repositories/prompt-repositories.js";
export * from "./repositories/supabase-prompt-repositories.js";
export * from "./services/prompt-template-service.js";
export * from "./services/prompt-context-service.js";
export * from "./services/prompt-orchestrator-service.js";
