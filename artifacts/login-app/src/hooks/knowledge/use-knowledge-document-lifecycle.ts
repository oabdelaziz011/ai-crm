import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useKnowledgePlatformServices } from "@/lib/knowledge-platform";
import { KNOWLEDGE_DOCUMENTS_KEY } from "./use-knowledge-documents";

export function usePublishKnowledgeDocument(companyId: string | null) {
  const { services, context } = useKnowledgePlatformServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      if (!companyId) throw new Error("Company is required.");
      if (!services) throw new Error("Knowledge platform is still loading.");
      return services.publishing.publishDocument(context, documentId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: KNOWLEDGE_DOCUMENTS_KEY });
    },
  });
}

export function useArchiveKnowledgeDocument(companyId: string | null) {
  const { services, context } = useKnowledgePlatformServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      if (!companyId) throw new Error("Company is required.");
      if (!services) throw new Error("Knowledge platform is still loading.");
      return services.publishing.archiveDocument(context, documentId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: KNOWLEDGE_DOCUMENTS_KEY });
    },
  });
}

export function useRestoreKnowledgeDocument(companyId: string | null) {
  const { services, context } = useKnowledgePlatformServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      if (!companyId) throw new Error("Company is required.");
      if (!services) throw new Error("Knowledge platform is still loading.");
      return services.publishing.restoreDocument(context, documentId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: KNOWLEDGE_DOCUMENTS_KEY });
    },
  });
}

export function useDeleteKnowledgeDocument(companyId: string | null) {
  const { services, context } = useKnowledgePlatformServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      if (!companyId) throw new Error("Company is required.");
      if (!services) throw new Error("Knowledge platform is still loading.");
      return services.publishing.deleteDocument(context, documentId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: KNOWLEDGE_DOCUMENTS_KEY });
    },
  });
}
