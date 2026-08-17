import type { TFunction } from "i18next";
import type { PromptSectionKey, PromptTemplateType } from "@workspace/ai-prompt-orchestrator";

export function translatePromptSection(t: TFunction<"common">, key: PromptSectionKey | string): string {
  return t(`prompts.sections.${key}`, { defaultValue: key });
}

export function translatePromptType(t: TFunction<"common">, type: PromptTemplateType | string): string {
  return t(`prompts.types.${type}`, { defaultValue: type });
}

export function translatePromptLifecycle(t: TFunction<"common">, status: string): string {
  return t(`prompts.lifecycle.${status}`, { defaultValue: status });
}

export function translatePromptPresetName(t: TFunction<"common">, key: string, fallback: string): string {
  return t(`prompts.presets.${key}.name`, { defaultValue: fallback });
}

export function translatePromptPresetDescription(
  t: TFunction<"common">,
  key: string,
  fallback: string,
): string {
  return t(`prompts.presets.${key}.description`, { defaultValue: fallback });
}

export function translatePromptTemplateName(
  t: TFunction<"common">,
  key: string,
  fallback: string,
): string {
  return t(`prompts.presets.${key}.name`, {
    defaultValue: t(`prompts.systemNames.${key}`, { defaultValue: fallback }),
  });
}

export function translatePromptTemplateDescription(
  t: TFunction<"common">,
  key: string,
  fallback: string,
): string {
  return t(`prompts.presets.${key}.description`, {
    defaultValue: t(`prompts.systemNames.${key}_description`, { defaultValue: fallback || key }),
  });
}
