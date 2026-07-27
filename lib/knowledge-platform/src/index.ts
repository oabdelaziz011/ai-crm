import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnowledgeEmbeddingQueuePort } from "./ports/knowledge-embedding-queue-port.js";
import { createDefaultChunkStrategyRegistry, type ChunkStrategyRegistry, type ChunkingStrategyName } from "./ingestion/chunk-strategy-registry.js";
import type { ChunkingOptions } from "./ingestion/chunking-strategy.js";
import { PassthroughDocumentImporter } from "./ingestion/ingestion-contracts.js";
import { ParserRegistry } from "./ingestion/parser-registry.js";
import {
  createSupabaseKnowledgeChunkRepository,
  createSupabaseKnowledgeDocumentRepository,
  createSupabaseKnowledgeSectionRepository,
  createSupabaseKnowledgeSourceRepository,
  createSupabaseKnowledgeTagRepository,
  createSupabaseKnowledgeVersionRepository,
} from "./repositories/supabase-knowledge-repositories.js";
import { KnowledgeChunkService } from "./services/knowledge-chunk-service.js";
import { KnowledgeDocumentService } from "./services/knowledge-document-service.js";
import { KnowledgeImportService, KnowledgeParserService } from "./services/knowledge-import-service.js";
import { KnowledgePublishingService } from "./services/knowledge-publishing-service.js";
import { KnowledgeSectionService } from "./services/knowledge-section-service.js";
import { KnowledgeSourceService, KnowledgeRegistryService } from "./services/knowledge-source-service.js";
import { KnowledgeVersionService } from "./services/knowledge-version-service.js";

export type KnowledgePlatformServices = {
  sources: KnowledgeSourceService;
  documents: KnowledgeDocumentService;
  versions: KnowledgeVersionService;
  publishing: KnowledgePublishingService;
  sections: KnowledgeSectionService;
  chunks: KnowledgeChunkService;
  import: KnowledgeImportService;
  parser: KnowledgeParserService;
  /** @deprecated Use sources */
  registry: KnowledgeRegistryService;
};

export function createKnowledgePlatformServices(
  client: SupabaseClient,
  options?: { embeddingQueue?: KnowledgeEmbeddingQueuePort },
): KnowledgePlatformServices {
  const sourceRepository = createSupabaseKnowledgeSourceRepository(client);
  const documentRepository = createSupabaseKnowledgeDocumentRepository(client);
  const versionRepository = createSupabaseKnowledgeVersionRepository(client);
  const sectionRepository = createSupabaseKnowledgeSectionRepository(client);
  const tagRepository = createSupabaseKnowledgeTagRepository(client);
  const chunkRepository = createSupabaseKnowledgeChunkRepository(client);
  const chunkStrategyRegistry = createDefaultChunkStrategyRegistry();
  const parserService = new KnowledgeParserService(new ParserRegistry());

  const sources = new KnowledgeSourceService(sourceRepository);
  const documents = new KnowledgeDocumentService(documentRepository, sourceRepository, versionRepository);
  const versions = new KnowledgeVersionService(versionRepository, documentRepository);
  const publishing = new KnowledgePublishingService(
    documentRepository,
    versionRepository,
    chunkRepository,
    versions,
    options?.embeddingQueue,
  );
  const sections = new KnowledgeSectionService(sectionRepository, versionRepository);
  const chunks = new KnowledgeChunkService(
    chunkRepository,
    documentRepository,
    versionRepository,
    sectionRepository,
    chunkStrategyRegistry,
  );

  return {
    sources,
    documents,
    versions,
    publishing,
    sections,
    chunks,
    parser: parserService,
    registry: sources,
    import: new KnowledgeImportService(
      sourceRepository,
      documentRepository,
      versionRepository,
      tagRepository,
      documents,
      sections,
      chunks,
      parserService,
      new PassthroughDocumentImporter(),
    ),
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./utils/knowledge-utils.js";
export * from "./repositories/knowledge-repositories.js";
export * from "./repositories/supabase-knowledge-repositories.js";
export * from "./services/knowledge-source-service.js";
export * from "./services/knowledge-document-service.js";
export * from "./services/knowledge-version-service.js";
export * from "./services/knowledge-section-service.js";
export * from "./services/knowledge-chunk-service.js";
export * from "./services/knowledge-publishing-service.js";
export * from "./ports/knowledge-embedding-queue-port.js";
export * from "./utils/document-lifecycle.js";
export * from "./ingestion/chunk-strategy-registry.js";
export * from "./utils/chunking-config.js";
