import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateKnowledgeSourceInput } from "@workspace/knowledge-platform";
import { useKnowledgePlatformServices } from "@/lib/knowledge-platform";
import { KNOWLEDGE_SOURCES_KEY } from "@/hooks/knowledge/use-knowledge-sources";

export function useCreateKnowledgeSource() {
  const { services, context } = useKnowledgePlatformServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateKnowledgeSourceInput) => {
      if (!services) throw new Error("Knowledge platform is still loading.");
      return services.sources.createSource(context, input);
    },
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: [...KNOWLEDGE_SOURCES_KEY, input.companyId] });
    },
  });
}
