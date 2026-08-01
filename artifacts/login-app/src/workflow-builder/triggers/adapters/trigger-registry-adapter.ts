import type { WorkflowDocument } from "../../core/types";
import {
  createTriggerConfigurationFromEntry,
  inferCatalogIdFromPlatformTrigger,
  listTriggerCategories,
  projectTriggerCatalog,
} from "../catalog/trigger-catalog-projection";
import { readTriggerConfig } from "../utilities/trigger-config-utils";
import type {
  TriggerCatalogEntry,
  TriggerCatalogId,
  TriggerCategory,
  TriggerConfiguration,
} from "../types/trigger-types";

const TRIGGER_CATALOG = projectTriggerCatalog();
const catalogById = new Map(TRIGGER_CATALOG.map((item) => [item.id, item]));

export function getTriggerCatalogEntry(catalogId: TriggerCatalogId): TriggerCatalogEntry {
  return catalogById.get(catalogId) ?? catalogById.get("inbound_message")!;
}

export function listTriggerCatalogEntries(): TriggerCatalogEntry[] {
  return TRIGGER_CATALOG;
}

export function listTriggerCatalogByCategory(category: TriggerCategory): TriggerCatalogEntry[] {
  return TRIGGER_CATALOG.filter((item) => item.category === category);
}

export function searchTriggerCatalog(query: string): TriggerCatalogEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return TRIGGER_CATALOG;
  return TRIGGER_CATALOG.filter((item) => {
    const haystack = [item.id, item.category, item.platformTriggerType, item.channel, item.businessEvent]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

export function resolveDefaultTriggerConfiguration(document: WorkflowDocument): TriggerConfiguration {
  const existing = readTriggerConfig(document);
  if (existing) return existing;

  const fromType = inferCatalogIdFromPlatformTrigger(document.triggerType);
  return createTriggerConfigurationFromCatalog(getTriggerCatalogEntry(fromType));
}

export function createTriggerConfigurationFromCatalog(entry: TriggerCatalogEntry): TriggerConfiguration {
  return createTriggerConfigurationFromEntry(entry);
}

export function applyCatalogSelection(catalogId: TriggerCatalogId): {
  triggerType: WorkflowDocument["triggerType"];
  triggerConfig: TriggerConfiguration;
} {
  const entry = getTriggerCatalogEntry(catalogId);
  return {
    triggerType: entry.platformTriggerType,
    triggerConfig: createTriggerConfigurationFromCatalog(entry),
  };
}

export { listTriggerCategories };
