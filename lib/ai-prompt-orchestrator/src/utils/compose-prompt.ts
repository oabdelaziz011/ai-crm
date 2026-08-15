import { SECTION_SEPARATOR } from "../constants.js";
import type { PromptOrchestrationMode, PromptSectionKey } from "../constants.js";
import type { ResponseContractBuilder } from "../builders/prompt-builders.js";
import type {
  BuiltPromptSection,
  BuilderSectionMap,
  OutputContract,
  PromptSectionConfig,
  PromptTemplateVersionRecord,
} from "../types.js";

export function applyTemplateSectionOverrides(
  builtSections: BuilderSectionMap,
  version: PromptTemplateVersionRecord,
): BuilderSectionMap {
  const merged: BuilderSectionMap = { ...builtSections };

  for (const [key, config] of Object.entries(version.sections) as Array<[PromptSectionKey, PromptSectionConfig]>) {
    if (config?.enabled === false) {
      delete merged[key];
      continue;
    }

    const existing = merged[key];
    const prefix = config.content?.trim() ?? "";
    if (!existing && !prefix) continue;

    // Runtime-detected language must win over the seeded tenant template
    // ("Respond in English unless...") so WhatsApp Arabic messages stay Arabic.
    if (key === "language" && existing?.content?.trim()) {
      merged[key] = {
        key,
        title: config.title ?? existing.title ?? key,
        content: existing.content,
      };
      continue;
    }

    merged[key] = {
      key,
      title: config.title ?? existing?.title ?? key,
      content: joinSectionContent(prefix, existing?.content ?? ""),
    };
  }

  return merged;
}

function joinSectionContent(prefix: string, dynamicContent: string): string {
  if (prefix && dynamicContent) return `${prefix}\n\n${dynamicContent}`;
  return prefix || dynamicContent;
}

export function orderPromptSections(
  sectionOrder: PromptSectionKey[],
  sections: BuilderSectionMap,
  responseContractBuilder: ResponseContractBuilder,
  version: PromptTemplateVersionRecord,
  formattingRules?: string[],
  mode: PromptOrchestrationMode = "conversation",
): BuiltPromptSection[] {
  const ordered: BuiltPromptSection[] = [];

  for (const key of sectionOrder) {
    if (mode === "conversation" && key === "recent_messages") continue;
    const section = sections[key];
    if (section) {
      ordered.push(section);
    }
  }

  if (!ordered.some((section) => section.key === "formatting_rules") && formattingRules?.length) {
    ordered.push(responseContractBuilder.buildFormattingSection(formattingRules));
  }

  if (
    mode === "execution" &&
    !ordered.some((section) => section.key === "output_contract") &&
    version.output_contract.format === "json"
  ) {
    const contractConfig = version.sections.output_contract;
    if (contractConfig?.enabled !== false) {
      ordered.push(
        responseContractBuilder.buildOutputContractSection(
          version.output_contract.instructions,
          version.output_contract.schema,
        ),
      );
    }
  }

  return ordered;
}

export function composeFinalPrompt(sections: BuiltPromptSection[]): string {
  return sections
    .map((section) => `## ${section.title}\n${section.content}`.trim())
    .join(SECTION_SEPARATOR);
}

export function normalizeOutputContract(value: unknown): OutputContract {
  if (typeof value === "object" && value !== null) {
    const contract = value as Record<string, unknown>;
    return {
      format: contract.format === "text" ? "text" : "json",
      instructions:
        typeof contract.instructions === "string"
          ? contract.instructions
          : "Return output that conforms to the structured response contract.",
      schema:
        typeof contract.schema === "object" && contract.schema !== null
          ? (contract.schema as Record<string, unknown>)
          : undefined,
    };
  }

  return {
    format: "text",
    instructions: "Respond naturally in plain text to the customer.",
  };
}

export function parseSectionOrder(value: unknown): PromptSectionKey[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PromptSectionKey => typeof item === "string");
}

export function ensureCustomer360SectionOrder(
  sectionOrder: PromptSectionKey[],
  includeCustomer360: boolean,
): PromptSectionKey[] {
  if (!includeCustomer360 || sectionOrder.includes("customer_360")) {
    return sectionOrder;
  }

  const assistantIndex = sectionOrder.indexOf("assistant_profile");
  const insertAt = assistantIndex >= 0 ? assistantIndex + 1 : Math.min(1, sectionOrder.length);
  return [...sectionOrder.slice(0, insertAt), "customer_360", ...sectionOrder.slice(insertAt)];
}

export function ensureKnowledgeSectionOrder(
  sectionOrder: PromptSectionKey[],
  includeKnowledge: boolean,
): PromptSectionKey[] {
  if (!includeKnowledge || sectionOrder.includes("knowledge_context")) {
    return sectionOrder;
  }

  const customer360Index = sectionOrder.indexOf("customer_360");
  const toolIndex = sectionOrder.indexOf("intent_decision");
  const toolResultsIndex = sectionOrder.indexOf("tool_results");

  let insertAt = sectionOrder.length;
  if (customer360Index >= 0) {
    insertAt = customer360Index + 1;
  } else if (toolIndex >= 0) {
    insertAt = toolIndex;
  } else if (toolResultsIndex >= 0) {
    insertAt = toolResultsIndex;
  }

  return [...sectionOrder.slice(0, insertAt), "knowledge_context", ...sectionOrder.slice(insertAt)];
}

export function renderSectionsWithVariables(
  renderer: import("../rendering/prompt-renderer.js").PromptRenderer,
  sections: BuilderSectionMap,
  context: Record<string, unknown>,
): BuilderSectionMap {
  const rendered: BuilderSectionMap = { ...sections };
  for (const [key, section] of Object.entries(rendered) as Array<[PromptSectionKey, BuiltPromptSection]>) {
    if (!section?.content) continue;
    const result = renderer.renderTemplate(section.content, context);
    rendered[key] = { ...section, content: result.text };
  }
  return rendered;
}
