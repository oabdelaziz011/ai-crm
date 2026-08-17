import type {
  CreatePromptTemplateVersionInput,
  PromptSectionConfig,
  PromptSectionKey,
} from "@workspace/ai-prompt-orchestrator";

export function buildOutputContractFromSections(
  sections: Partial<Record<PromptSectionKey, PromptSectionConfig>>,
): CreatePromptTemplateVersionInput["outputContract"] {
  const instructions =
    sections.output_contract?.content?.trim() ||
    "Return output that conforms to the structured response contract.";
  const wantsJson = /json/i.test(instructions);
  return {
    format: wantsJson ? "json" : "text",
    instructions,
  };
}
