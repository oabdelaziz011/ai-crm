import type { WorkflowDocument } from "../../core/types";
import type { TriggerConfiguration } from "../types/trigger-types";

export const TRIGGER_CONFIG_EXTENSION_KEY = "triggerConfig";

export function readTriggerConfig(document: WorkflowDocument): TriggerConfiguration | undefined {
  const value = document.extensions?.[TRIGGER_CONFIG_EXTENSION_KEY];
  if (!value || typeof value !== "object") return undefined;
  const config = value as TriggerConfiguration;
  if (typeof config.catalogId !== "string") return undefined;
  return config;
}

export function readTriggerConfigFromMetadata(metadata: Record<string, unknown>): TriggerConfiguration | undefined {
  const value = metadata[TRIGGER_CONFIG_EXTENSION_KEY];
  if (!value || typeof value !== "object") return undefined;
  const config = value as TriggerConfiguration;
  if (typeof config.catalogId !== "string") return undefined;
  return config;
}

export function withTriggerConfigExtension(
  document: WorkflowDocument,
  triggerConfig: TriggerConfiguration | undefined,
): WorkflowDocument {
  if (!triggerConfig) {
    if (!document.extensions?.[TRIGGER_CONFIG_EXTENSION_KEY]) return document;
    const { [TRIGGER_CONFIG_EXTENSION_KEY]: _removed, ...rest } = document.extensions;
    return {
      ...document,
      extensions: Object.keys(rest).length > 0 ? rest : undefined,
    };
  }

  return {
    ...document,
    extensions: {
      ...document.extensions,
      [TRIGGER_CONFIG_EXTENSION_KEY]: triggerConfig,
    },
  };
}

export function mergeTriggerConfigPatch(
  current: TriggerConfiguration,
  patch: Partial<TriggerConfiguration>,
): TriggerConfiguration {
  return {
    ...current,
    ...patch,
    eventFilters: patch.eventFilters ? { ...current.eventFilters, ...patch.eventFilters } : current.eventFilters,
  };
}
