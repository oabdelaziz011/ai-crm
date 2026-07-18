import { useQuery } from "@tanstack/react-query";
import { useKnowledgePlatformServices } from "@/lib/knowledge-platform";

export const KNOWLEDGE_DOCUMENTS_KEY = ["knowledge", "documents"] as const;

export function useKnowledgeDocuments(companyId: string | null, sourceId?: string, enabled = true) {
  const { services, context } = useKnowledgePlatformServices();

  return useQuery({
    queryKey: [...KNOWLEDGE_DOCUMENTS_KEY, companyId, sourceId ?? "all"],
    enabled: enabled && Boolean(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      return services.documents.listDocuments(context, {
        companyId,
        sourceId,
      });
    },
  });
}
