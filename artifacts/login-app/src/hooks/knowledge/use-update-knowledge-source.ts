import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateKnowledgeSourceInput } from "@workspace/knowledge-platform";
import { aiEmployeeKnowledgeKey } from "@/lib/ai-employees/cache";
import { useKnowledgePlatformServices } from "@/lib/knowledge-platform";
import { KNOWLEDGE_SOURCES_KEY } from "@/hooks/knowledge/use-knowledge-sources";

export function useUpdateKnowledgeSource(companyId: string | null) {
  const { services, context } = useKnowledgePlatformServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateKnowledgeSourceInput) => {
      if (!services) throw new Error("Knowledge platform is still loading.");
      return services.sources.updateSource(context, input);
    },
    onSuccess: () => {
      if (!companyId) return;
      void queryClient.invalidateQueries({ queryKey: [...KNOWLEDGE_SOURCES_KEY, companyId] });
      void queryClient.invalidateQueries({ queryKey: aiEmployeeKnowledgeKey(companyId) });
    },
  });
}
