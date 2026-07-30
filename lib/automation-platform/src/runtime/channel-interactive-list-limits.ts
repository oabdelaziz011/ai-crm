import type { AutomationChannel } from "../constants.js";
import type { InteractiveListLimits, ProviderCapabilities } from "../transport/models.js";

export const UNLIMITED_INTERACTIVE_LIST_ROWS = Number.MAX_SAFE_INTEGER;

export const DEFAULT_INTERACTIVE_LIST_LIMITS: InteractiveListLimits = {
  maxRowsPerList: UNLIMITED_INTERACTIVE_LIST_ROWS,
  maxSectionsPerList: UNLIMITED_INTERACTIVE_LIST_ROWS,
  supportsListPagination: false,
};

export const CHANNEL_INTERACTIVE_LIST_LIMITS: Partial<Record<AutomationChannel, InteractiveListLimits>> = {
  whatsapp: {
    maxRowsPerList: 10,
    maxSectionsPerList: 10,
    supportsListPagination: true,
  },
  web_chat: {
    maxRowsPerList: 100,
    maxSectionsPerList: 10,
    supportsListPagination: true,
  },
  api: DEFAULT_INTERACTIVE_LIST_LIMITS,
  email: DEFAULT_INTERACTIVE_LIST_LIMITS,
};

export function interactiveListLimitsFromCapabilities(
  capabilities: ProviderCapabilities,
): InteractiveListLimits {
  return capabilities.interactiveList ?? DEFAULT_INTERACTIVE_LIST_LIMITS;
}

export function resolveInteractiveListLimits(channel: AutomationChannel): InteractiveListLimits {
  return CHANNEL_INTERACTIVE_LIST_LIMITS[channel] ?? DEFAULT_INTERACTIVE_LIST_LIMITS;
}

export function countInteractiveListRows(
  sections: Array<{ rows?: Array<unknown> }>,
): number {
  return sections.reduce((total, section) => total + (section.rows?.length ?? 0), 0);
}
