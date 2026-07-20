import type { BuiltPromptSection } from "../types.js";
import { composeFinalPrompt } from "../utils/compose-prompt.js";

export type PromptCompositionPlan = {
  sectionOrder: string[];
  separator?: string;
};

export class PromptComposer {
  compose(sections: BuiltPromptSection[], plan: PromptCompositionPlan): string {
    const ordered = plan.sectionOrder
      .map((key) => sections.find((section) => section.key === key))
      .filter((section): section is BuiltPromptSection => Boolean(section));

    const remaining = sections.filter((section) => !ordered.some((item) => item.key === section.key));
    const finalSections = [...ordered, ...remaining];

    if (plan.separator) {
      return finalSections
        .map((section) => `## ${section.title}\n${section.content}`.trim())
        .join(plan.separator);
    }

    return composeFinalPrompt(finalSections);
  }
}

export class PromptComposerRegistry {
  private readonly composers = new Map<string, PromptComposer>();

  register(key: string, composer: PromptComposer): this {
    this.composers.set(key, composer);
    return this;
  }

  resolve(key?: string | null): PromptComposer {
    if (key && this.composers.has(key)) return this.composers.get(key)!;
    return this.composers.get("default") ?? new PromptComposer();
  }
}

export function createDefaultPromptComposerRegistry(): PromptComposerRegistry {
  const registry = new PromptComposerRegistry();
  registry.register("default", new PromptComposer());
  return registry;
}
