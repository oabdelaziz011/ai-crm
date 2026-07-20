import type { PromptRenderer } from "../rendering/prompt-renderer.js";
import type { PromptValidator } from "../validation/prompt-validator.js";
import type { PromptComposer } from "../composition/prompt-composer.js";
import type { BuiltPromptSection, PromptSectionConfig } from "../types.js";
import type { PromptSectionKey } from "../constants.js";
import type { VariableResolutionContext } from "../providers/variable-providers.js";

export type PromptPreviewInput = {
  sections: Partial<Record<PromptSectionKey, PromptSectionConfig>>;
  sectionOrder: PromptSectionKey[];
  context: VariableResolutionContext;
  outputContractInstructions?: string;
};

export type PromptPreviewResult = {
  sections: BuiltPromptSection[];
  renderedPrompt: string;
  validationIssues: ReturnType<PromptValidator["validate"]>;
  variableCount: number;
  estimatedTokens: number;
};

export class PromptPreviewService {
  constructor(
    private readonly renderer: PromptRenderer,
    private readonly validator: PromptValidator,
    private readonly composer: PromptComposer,
  ) {}

  preview(input: PromptPreviewInput): PromptPreviewResult {
    const validationIssues = this.validator.validate({
      sections: input.sections,
      outputContractInstructions: input.outputContractInstructions,
      knownVariables: this.renderer.listKnownVariablePaths(),
      maxLength: 32000,
    });

    const sections: BuiltPromptSection[] = [];
    for (const key of input.sectionOrder) {
      const config = input.sections[key];
      if (config?.enabled === false) continue;
      const content = config?.content?.trim();
      if (!content) continue;
      const rendered = this.renderer.renderTemplate(content, input.context);
      sections.push({
        key,
        title: config?.title ?? key,
        content: rendered.text,
      });
    }

    if (input.outputContractInstructions?.trim()) {
      const rendered = this.renderer.renderTemplate(input.outputContractInstructions, input.context);
      sections.push({
        key: "output_contract",
        title: "Output Contract",
        content: rendered.text,
      });
    }

    const renderedPrompt = this.composer.compose(sections, { sectionOrder: input.sectionOrder });
    const variableCount = sections.reduce(
      (total, section) => total + this.renderer.extractVariables(section.content).length,
      0,
    );

    return {
      sections,
      renderedPrompt,
      validationIssues,
      variableCount,
      estimatedTokens: Math.max(1, Math.ceil(renderedPrompt.length / 4)),
    };
  }
}
