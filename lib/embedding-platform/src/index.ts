import type { SupabaseClient } from "@supabase/supabase-js";
import type { VectorStoreServices } from "@workspace/vector-store";
import { createDefaultEmbeddingProviderFactory } from "./factory/embedding-provider-factory.js";
import type { EmbeddingTelemetryPort } from "./ports/embedding-telemetry-port.js";
import { NoopEmbeddingTelemetryPort } from "./ports/embedding-telemetry-port.js";
import {
  createSupabaseEmbeddingJobRepository,
  createSupabaseEmbeddingProviderConnectionRepository,
  createSupabaseEmbeddingProviderDefinitionRepository,
  createSupabaseKnowledgeChunkReader,
  createSupabaseKnowledgeEmbeddingRepository,
} from "./repositories/supabase-embedding-repositories.js";
import { createSupabaseKnowledgeDocumentRepository } from "@workspace/knowledge-platform/repositories";
import { EmbeddingDocumentCompletionService } from "./services/embedding-document-completion-service.js";
import { EmbeddingGenerationService, EmbeddingJobService } from "./services/embedding-generation-service.js";
import { EmbeddingIndexingService } from "./services/embedding-indexing-service.js";
import { createEmbeddingQueueService, EmbeddingQueueService } from "./services/embedding-queue-service.js";
import { createEmbeddingWorkerService, EmbeddingWorkerService } from "./services/embedding-worker-service.js";
import { EmbeddingProviderRegistryService } from "./services/embedding-provider-registry-service.js";
import { EmbeddingVersionService } from "./services/embedding-version-service.js";

export type EmbeddingPlatformServices = {
  registry: EmbeddingProviderRegistryService;
  factory: ReturnType<typeof createDefaultEmbeddingProviderFactory>;
  generation: EmbeddingGenerationService;
  jobs: EmbeddingJobService;
  versions: EmbeddingVersionService;
  queue: EmbeddingQueueService;
  worker?: EmbeddingWorkerService;
};

export function createEmbeddingPlatformServices(
  client: SupabaseClient,
  options?: { telemetry?: EmbeddingTelemetryPort; vectorStore?: VectorStoreServices },
): EmbeddingPlatformServices {
  const definitionRepository = createSupabaseEmbeddingProviderDefinitionRepository(client);
  const connectionRepository = createSupabaseEmbeddingProviderConnectionRepository(client);
  const embeddingRepository = createSupabaseKnowledgeEmbeddingRepository(client);
  const jobRepository = createSupabaseEmbeddingJobRepository(client);
  const chunkReader = createSupabaseKnowledgeChunkReader(client);
  const documentRepository = createSupabaseKnowledgeDocumentRepository(client);
  const factory = createDefaultEmbeddingProviderFactory(definitionRepository);
  const telemetry = options?.telemetry ?? new NoopEmbeddingTelemetryPort();

  const versions = new EmbeddingVersionService(embeddingRepository);
  const generation = new EmbeddingGenerationService(
    factory,
    connectionRepository,
    embeddingRepository,
    chunkReader,
    versions,
    telemetry,
  );
  const jobs = new EmbeddingJobService(jobRepository, connectionRepository, chunkReader, generation, versions);
  const queue = createEmbeddingQueueService(client, {
    documentRepository,
    jobRepository,
    connectionRepository,
    chunkReader,
    versionService: versions,
  });

  let worker: EmbeddingWorkerService | undefined;
  if (options?.vectorStore) {
    worker = createEmbeddingWorkerService({
      client,
      jobs,
      jobRepository,
      indexing: new EmbeddingIndexingService(options.vectorStore),
      completion: new EmbeddingDocumentCompletionService(documentRepository, jobRepository),
      telemetry,
    });
  }

  return {
    registry: new EmbeddingProviderRegistryService(definitionRepository, connectionRepository, factory),
    factory,
    generation,
    jobs,
    versions,
    queue,
    worker,
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./utils/embedding-utils.js";
export * from "./utils/validate-configuration.js";
export * from "./ports/embedding-telemetry-port.js";
export * from "./providers/provider-contract.js";
export * from "./providers/openai-embedding-adapter.js";
export {
  AzureOpenAIEmbeddingAdapter,
  GeminiEmbeddingAdapter,
  CohereEmbeddingAdapter,
  VoyageEmbeddingAdapter,
  OllamaEmbeddingAdapter,
  createEmbeddingAdapters,
  createStubEmbeddingAdapters,
} from "./providers/stub-adapters.js";
export * from "./providers/stub-adapter-base.js";
export * from "./providers/http/retry-client.js";
export * from "./factory/embedding-provider-factory.js";
export * from "./repositories/embedding-repositories.js";
export * from "./repositories/supabase-embedding-repositories.js";
export * from "./services/embedding-provider-registry-service.js";
export * from "./services/embedding-generation-service.js";
export * from "./services/embedding-queue-service.js";
export * from "./services/embedding-indexing-service.js";
export * from "./services/embedding-document-completion-service.js";
export * from "./services/embedding-worker-service.js";
export * from "./services/embedding-version-service.js";
