import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ImportDocumentInput } from "@workspace/knowledge-platform";
import { useKnowledgePlatformServices } from "@/lib/knowledge-platform";
import { KNOWLEDGE_DOCUMENTS_KEY } from "@/hooks/knowledge/use-knowledge-documents";

export function useImportKnowledgeDocument() {
  const { services, context } = useKnowledgePlatformServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ImportDocumentInput) => services.import.importDocument(context, input),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: KNOWLEDGE_DOCUMENTS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["knowledge", "sources", input.companyId] });
    },
  });
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to read file."));
        return;
      }
      const base64 = reader.result.split(",")[1];
      if (!base64) {
        reject(new Error("Failed to encode file."));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}
