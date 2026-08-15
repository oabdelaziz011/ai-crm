import type { SupabaseClient } from "@supabase/supabase-js";
import { PromptPreviewService } from "./lifecycle/preview-service.js";
import { PromptPublishService } from "./lifecycle/publish-service.js";
import { PromptRollbackService } from "./lifecycle/rollback-service.js";
import { PromptMetadataTracker } from "./metadata/prompt-metadata-tracker.js";
import {
  createSupabasePromptBuildRepository,
  createSupabasePromptTemplateRepository,
  createSupabasePromptTemplateVersionRepository,
} from "./repositories/supabase-prompt-repositories.js";
import { createPromptPlatformRegistries } from "./registries/prompt-registries.js";
import { PromptRuntimeService } from "./runtime/prompt-runtime-service.js";
import { PromptContextService } from "./services/prompt-context-service.js";
import { PromptOrchestratorService } from "./services/prompt-orchestrator-service.js";
import { PromptTemplateService } from "./services/prompt-template-service.js";

export type PromptOrchestratorServices = {
  templates: PromptTemplateService;
  context: PromptContextService;
  orchestrator: PromptOrchestratorService;
  runtime: PromptRuntimeService;
  preview: PromptPreviewService;
  publish: PromptPublishService;
  rollback: PromptRollbackService;
  metadata: PromptMetadataTracker;
  registries: ReturnType<typeof createPromptPlatformRegistries>;
};

export function createPromptOrchestratorServices(client: SupabaseClient): PromptOrchestratorServices {
  const templateRepository = createSupabasePromptTemplateRepository(client);
  const versionRepository = createSupabasePromptTemplateVersionRepository(client);
  const buildRepository = createSupabasePromptBuildRepository(client);
  const contextService = new PromptContextService();
  const registries = createPromptPlatformRegistries();
  const metadata = new PromptMetadataTracker();

  const orchestrator = new PromptOrchestratorService(
    templateRepository,
    versionRepository,
    buildRepository,
    contextService,
    registries.renderer,
  );

  return {
    templates: new PromptTemplateService(templateRepository, versionRepository),
    context: contextService,
    orchestrator,
    runtime: new PromptRuntimeService({
      orchestrator,
      renderer: registries.renderer,
      validator: registries.validator,
      composer: registries.composers.resolve("default"),
      policies: registries.policies,
      metadata,
    }),
    preview: new PromptPreviewService(
      registries.renderer,
      registries.validator,
      registries.composers.resolve("default"),
    ),
    publish: new PromptPublishService(templateRepository, versionRepository),
    rollback: new PromptRollbackService(templateRepository, versionRepository),
    metadata,
    registries,
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./builders/prompt-builders.js";
export * from "./utils/compose-message-plan.js";
export * from "./utils/compose-gateway-messages.js";
export * from "./utils/compose-prompt.js";
export * from "./utils/detect-reply-language.js";
export * from "./rendering/variable-parser.js";
export * from "./rendering/prompt-renderer.js";
export * from "./validation/prompt-validator.js";
export * from "./providers/variable-providers.js";
export * from "./providers/variable-provider-registry.js";
export * from "./policies/prompt-policy.js";
export * from "./composition/prompt-composer.js";
export * from "./metadata/prompt-metadata-tracker.js";
export * from "./lifecycle/types.js";
export * from "./lifecycle/publish-validation.js";
export * from "./lifecycle/compare-service.js";
export * from "./lifecycle/publish-service.js";
export * from "./lifecycle/rollback-service.js";
export * from "./lifecycle/preview-service.js";
export * from "./runtime/prompt-runtime-service.js";
export * from "./registries/prompt-registries.js";
export * from "./templates/template-library.js";
export * from "./repositories/prompt-repositories.js";
export * from "./repositories/supabase-prompt-repositories.js";
export * from "./services/prompt-template-service.js";
export * from "./services/prompt-context-service.js";
export * from "./services/prompt-orchestrator-service.js";
