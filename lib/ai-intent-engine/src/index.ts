import type { SupabaseClient } from "@supabase/supabase-js";
import { createDefaultCompositeClassifier } from "./classifiers/composite-classifier.js";
import { createSupabaseConversationReader } from "./ports/supabase-conversation-reader.js";
import {
  createSupabaseIntentDefinitionRepository,
  createSupabaseIntentMatchRepository,
} from "./repositories/supabase-intent-repositories.js";
import { IntentEngineService } from "./services/intent-engine-service.js";
import { IntentMatchingService } from "./services/intent-matching-service.js";
import { IntentRegistryService } from "./services/intent-registry-service.js";

export type IntentEngineServices = {
  registry: IntentRegistryService;
  matching: IntentMatchingService;
  engine: IntentEngineService;
};

export function createIntentEngineServices(client: SupabaseClient): IntentEngineServices {
  const definitionRepository = createSupabaseIntentDefinitionRepository(client);
  const matchRepository = createSupabaseIntentMatchRepository(client);
  const conversationReader = createSupabaseConversationReader(client);
  const classifier = createDefaultCompositeClassifier();
  const matchingService = new IntentMatchingService(definitionRepository, classifier);

  return {
    registry: new IntentRegistryService(definitionRepository),
    matching: matchingService,
    engine: new IntentEngineService(
      definitionRepository,
      matchRepository,
      conversationReader,
      matchingService,
    ),
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./classifiers/classifier-contract.js";
export * from "./classifiers/rule-based-classifier.js";
export * from "./classifiers/keyword-classifier.js";
export * from "./classifiers/llm-classifier.js";
export * from "./classifiers/composite-classifier.js";
export * from "./ports/conversation-reader.js";
export * from "./ports/supabase-conversation-reader.js";
export * from "./repositories/intent-repositories.js";
export * from "./repositories/supabase-intent-repositories.js";
export * from "./services/intent-registry-service.js";
export * from "./services/intent-matching-service.js";
export * from "./services/intent-engine-service.js";
