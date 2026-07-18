import { useQuery } from "@tanstack/react-query";
import { useKnowledgePlatformServices } from "@/lib/knowledge-platform";

export const KNOWLEDGE_SOURCES_KEY = ["knowledge", "sources"] as const;

export function useKnowledgeSources(companyId: string | null, enabled = true) {
  const { services, context } = useKnowledgePlatformServices();

  return useQuery({
    queryKey: [...KNOWLEDGE_SOURCES_KEY, companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      return services.sources.listSources(context, { companyId });
    },
  });
}
