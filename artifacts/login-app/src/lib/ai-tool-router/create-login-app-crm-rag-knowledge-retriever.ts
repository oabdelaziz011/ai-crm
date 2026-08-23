import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createCrmRagKnowledgeRetriever,
  createKnowledgeRuntimeProvider,
  type CrmRagKnowledgeRetriever,
} from "@workspace/knowledge-runtime";
import { createRetrievalServices } from "@workspace/retrieval-engine";
import { resolveTenantRuntimeConfig } from "@workspace/tenant-ai-bootstrap";
import { createRetrievalPlatformPorts } from "@/lib/retrieval-engine/platform-adapters";
import { createEmbeddingPlatformServices } from "@workspace/embedding-platform";
import { createVectorQueryServices } from "@workspace/vector-query";

/**
 * Shared RAG retriever for login-app AI Employee `knowledge_search`.
 * Uses the same KnowledgeRuntimeProvider + tenant retrieval config as webhook.
 */
export function createLoginAppCrmRagKnowledgeRetriever(
  client: SupabaseClient,
): CrmRagKnowledgeRetriever {
  const embedding = createEmbeddingPlatformServices(client);
  const vectorQuery = createVectorQueryServices(client);
  const platformPorts = createRetrievalPlatformPorts({
    embedding: {
      registry: embedding.registry,
      factory: embedding.factory,
    },
    vectorQuery: {
      management: vectorQuery.management,
    },
    resolvePlatformConfiguration: async () => ({
      usesPlatformKey: true,
      __platformApiProxy: true,
    }),
  });
  const retrieval = createRetrievalServices(client, {
    queryEmbeddingPort: platformPorts.queryEmbeddingPort,
    vectorQueryPort: platformPorts.vectorQueryPort,
  });
  const knowledgeRuntime = createKnowledgeRuntimeProvider(retrieval.knowledge);

  return createCrmRagKnowledgeRetriever({
    knowledgeRuntime,
    resolveRetrievalConfig: async (companyId) => {
      const config = await resolveTenantRuntimeConfig(client, companyId);
      return config.knowledgeRetrieval;
    },
  });
}
