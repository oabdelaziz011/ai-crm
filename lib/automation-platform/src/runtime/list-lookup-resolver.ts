import { logListNodeLifecycle } from "../debug/list-node-lifecycle-debug.js";
import type { AutomationNodeRecord } from "../types.js";
import type { LookupListOptionRow, LookupOptionsPort } from "../ports/lookup-options-port.js";
import { resolveLookupFilterValues } from "./lookup-filter-resolver.js";

export const AVAILABLE_DATES_LOOKUP = "available_dates";

const DEFAULT_DAYS_AHEAD = 7;
const MIN_DAYS_AHEAD = 1;
const MAX_DAYS_AHEAD = 90;

function readDaysAhead(filters: Record<string, unknown> = {}): number {
  const raw = filters.days_ahead ?? filters.daysAhead;
  if (raw == null || raw === "") return DEFAULT_DAYS_AHEAD;
  const parsed = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS_AHEAD;
  return Math.min(MAX_DAYS_AHEAD, Math.max(MIN_DAYS_AHEAD, Math.floor(parsed)));
}

export function formatEmptyAvailabilityMessage(searchedWindow: number): string {
  return `No appointments are available during the next ${searchedWindow} days.`;
}

export function resolveAvailableDatesEmptyMessage(filters: Record<string, unknown> = {}): string {
  return formatEmptyAvailabilityMessage(readDaysAhead(filters));
}

export const AVAILABLE_DATES_EMPTY_MESSAGE = formatEmptyAvailabilityMessage(DEFAULT_DAYS_AHEAD);

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isListLookupMode(config: Record<string, unknown>): boolean {
  return config.mode === "lookup" || config.optionsSource === "lookup";
}

export function readListLookupRuntimeConfig(config: Record<string, unknown>) {
  return {
    lookup: readString(config.lookup),
    displayField: readString(config.displayField) || "name",
    valueField: readString(config.valueField) || "id",
    filters:
      config.filters && typeof config.filters === "object"
        ? (config.filters as Record<string, unknown>)
        : {},
  };
}

export async function resolveListNodeSections(
  node: AutomationNodeRecord,
  companyId: string,
  lookupOptionsPort?: LookupOptionsPort,
  variables: Record<string, unknown> = {},
  trace?: { runId?: string; sessionId?: string },
): Promise<Array<{ title: string; rows: Array<{ id: string; title: string; description?: string; value?: string; record?: Record<string, unknown> }> }>> {
  const config = node.config;
  if (!isListLookupMode(config)) {
    return Array.isArray(config.sections) ? (config.sections as Array<{ title: string; rows: Array<{ id: string; title: string; description?: string; value?: string; record?: Record<string, unknown> }> }>) : [];
  }

  const traceBase = {
    runId: trace?.runId ?? "unknown",
    sessionId: trace?.sessionId ?? "unknown",
    nodeId: node.id,
  };

  logListNodeLifecycle({
    stage: "before_execute_list_node",
    ...traceBase,
    reason: "resolve_list_sections_start",
  });

  if (!lookupOptionsPort) {
    logListNodeLifecycle({
      stage: "before_execute_list_node",
      ...traceBase,
      reason: "resolve_list_sections_failed:missing_lookup_port",
    });
    throw new Error("Lookup-backed list nodes require LookupOptionsPort.");
  }

  const lookupConfig = readListLookupRuntimeConfig(config);
  if (!lookupConfig.lookup) {
    logListNodeLifecycle({
      stage: "before_execute_list_node",
      ...traceBase,
      reason: "resolve_list_sections_failed:missing_lookup_key",
    });
    throw new Error("Lookup-backed list node requires config.lookup.");
  }

  const resolvedFilters = resolveLookupFilterValues(lookupConfig.filters, variables);
  logListNodeLifecycle({
    stage: "before_execute_list_node",
    ...traceBase,
    reason: `resolve_list_sections_fetch:${lookupConfig.lookup}`,
  });

  let rows: LookupListOptionRow[];
  try {
    rows = await lookupOptionsPort.fetchListOptions(companyId, {
      ...lookupConfig,
      filters: resolvedFilters,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logListNodeLifecycle({
      stage: "before_execute_list_node",
      ...traceBase,
      reason: `resolve_list_sections_failed:fetch_error:${message}`,
    });
    throw error;
  }

  if (rows.length === 0) {
    if (lookupConfig.lookup === AVAILABLE_DATES_LOOKUP) {
      logListNodeLifecycle({
        stage: "before_execute_list_node",
        ...traceBase,
        reason: "resolve_list_sections_empty:available_dates",
      });
      return [];
    }
    logListNodeLifecycle({
      stage: "before_execute_list_node",
      ...traceBase,
      reason: `resolve_list_sections_failed:no_options:${lookupConfig.lookup}`,
    });
    throw new Error("Lookup-backed list node returned no options.");
  }

  logListNodeLifecycle({
    stage: "after_send_list_message",
    ...traceBase,
    reason: `resolve_list_sections_complete:${lookupConfig.lookup}`,
    outboundQueueLength: rows.length,
  });

  return [
    {
      title: "Options",
      rows: rows.map((row) => ({
        id: row.id,
        title: row.title,
        ...(row.description ? { description: row.description } : {}),
        ...(row.value ? { value: row.value } : {}),
        ...(row.record ? { record: row.record } : {}),
      })),
    },
  ];
}

export function resolveAvailableDatesEmptyMessageFromConfig(
  config: Record<string, unknown>,
  variables: Record<string, unknown> = {},
): string {
  const lookupConfig = readListLookupRuntimeConfig(config);
  const resolvedFilters = resolveLookupFilterValues(lookupConfig.filters, variables);
  return resolveAvailableDatesEmptyMessage(resolvedFilters);
}
