import { useMemo } from "react";
import {
  listPromptLibraryTemplates,
  PROMPT_SECTION_KEYS,
  type PromptSectionConfig,
  type PromptSectionKey,
} from "@workspace/ai-prompt-orchestrator";
import { usePromptOrchestratorServices } from "@/lib/ai-prompt-orchestrator";

export function usePromptPreviewState(input: {
  sections: Partial<Record<PromptSectionKey, PromptSectionConfig>>;
  sectionOrder: PromptSectionKey[];
  sampleContext?: Record<string, unknown>;
}) {
  const { services } = usePromptOrchestratorServices();

  return useMemo(() => {
    return services.preview.preview({
      sections: input.sections,
      sectionOrder: input.sectionOrder,
      context: {
        companyId: "preview-company",
        customer: { name: "Alex Rivera", phone: "+1-555-0100", email: "alex@example.com" },
        company: { name: "VaultOS Demo" },
        booking: { date: "2026-07-20", time: "14:30" },
        workflowInput: { intent: "support" },
        workflowVariables: { priority: "high" },
        recentMessages: [{ role: "customer", content: "What are your hours?" }],
        ...input.sampleContext,
      },
      outputContractInstructions: input.sections.output_contract?.content,
    });
  }, [input.sampleContext, input.sectionOrder, input.sections, services.preview]);
}

export function usePromptVariableCatalog() {
  const { services } = usePromptOrchestratorServices();
  return services.registries.renderer.listKnownVariablePaths();
}

export function usePromptLibraryPresets() {
  return listPromptLibraryTemplates();
}

export function usePromptSectionKeys() {
  return PROMPT_SECTION_KEYS;
}
