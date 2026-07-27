import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useRuntimeChatConfig } from "@/hooks/ai-chat/use-runtime-chat-config";
import { useRetrievalServices } from "@/lib/retrieval-engine";
import { supabase } from "@/lib/supabase";
import { createCrmAgentToolPorts } from "./crm-agent-adapter";

async function keywordKnowledgeFallback(companyId: string, query: string) {
  const { data, error } = await supabase.rpc("knowledge_keyword_search", {
    p_company_id: companyId,
    p_query: query,
    p_limit: 8,
    p_source_ids: null,
    p_document_ids: null,
  });

  if (error) {
    return {
      results: [] as Array<{ title: string; excerpt: string; confidence: number }>,
      contextText: `Knowledge search unavailable: ${error.message}`,
    };
  }

  const rows = (data ?? []) as Array<{ document_title?: string; chunk_content?: string }>;
  const results = rows.map((row, index) => ({
    title: row.document_title ?? `Document ${index + 1}`,
    excerpt: (row.chunk_content ?? "").slice(0, 280),
    confidence: Math.max(0.1, 1 - index * 0.08),
  }));

  return {
    results,
    contextText:
      results.length > 0
        ? results.map((r, i) => `[${i + 1}] ${r.title}\n${r.excerpt}`).join("\n\n")
        : "No knowledge documents matched this query.",
  };
}

export function useCrmAgentToolPorts() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { services: retrievalServices, context: retrievalContext } = useRetrievalServices();
  const { data: runtimeConfig } = useRuntimeChatConfig(companyId, true);

  return useMemo(
    () =>
      createCrmAgentToolPorts({
        client: supabase,
        getActorUserId: () => user?.id ?? null,
        retrieveKnowledge: async (input) => {
          const knowledge = runtimeConfig?.knowledgeRetrieval;
          if (
            !knowledge?.embeddingConnectionId ||
            !knowledge?.vectorStoreConnectionId ||
            !knowledge?.collectionId
          ) {
            return keywordKnowledgeFallback(input.companyId, input.query);
          }

          try {
            const response = await retrievalServices.knowledge.retrieve(retrievalContext, {
              companyId: input.companyId,
              question: input.query,
              embeddingConnectionId: knowledge.embeddingConnectionId,
              vectorStoreConnectionId: knowledge.vectorStoreConnectionId,
              collectionId: knowledge.collectionId,
              searchMode: "hybrid",
              rerank: true,
            });

            const citations = response.citations ?? [];
            const chunks = response.chunks ?? [];
            const sourceItems = citations.length > 0 ? citations : chunks;

            const results = sourceItems.slice(0, 8).map((item, index) => ({
              title:
                "documentTitle" in item && item.documentTitle
                  ? String(item.documentTitle)
                  : `Source ${index + 1}`,
              excerpt: ("content" in item ? String(item.content) : "").slice(0, 280),
              confidence: response.confidence ?? Math.max(0.2, 1 - index * 0.1),
            }));

            return {
              results,
              contextText: response.contextText || "No knowledge context returned.",
            };
          } catch {
            return keywordKnowledgeFallback(input.companyId, input.query);
          }
        },
      }),
    [
      user?.id,
      retrievalServices.knowledge,
      retrievalContext,
      runtimeConfig?.knowledgeRetrieval?.embeddingConnectionId,
      runtimeConfig?.knowledgeRetrieval?.vectorStoreConnectionId,
      runtimeConfig?.knowledgeRetrieval?.collectionId,
    ],
  );
}
