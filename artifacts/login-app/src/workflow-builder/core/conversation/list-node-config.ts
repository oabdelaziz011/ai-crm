import type { ValidationIssue } from "../types";
import {
  getLookupEntityDefinition,
  isLookupEntityId,
  resolveLookupOutputVariableName,
  type ListDataSourceMode,
  type ListLookupConfig,
  type ListLookupFilters,
  type LookupEntityId,
} from "@/lib/lookups";

const WORKFLOW_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readListDataSourceMode(config: Record<string, unknown>): ListDataSourceMode {
  if (config.mode === "lookup" || config.optionsSource === "lookup") {
    return "lookup";
  }
  return "manual";
}

export function readListLookupConfig(config: Record<string, unknown>): ListLookupConfig | null {
  if (readListDataSourceMode(config) !== "lookup") return null;
  const lookup = readString(config.lookup);
  if (!isLookupEntityId(lookup)) return null;
  const definition = getLookupEntityDefinition(lookup);
  return {
    lookup,
    displayField: readString(config.displayField) || definition.defaultDisplayField,
    valueField: readString(config.valueField) || definition.defaultValueField,
    filters:
      config.filters && typeof config.filters === "object"
        ? (config.filters as ListLookupFilters)
        : {},
  };
}

export function createDefaultListLookupConfig(lookup: LookupEntityId = "services"): ListLookupConfig {
  const definition = getLookupEntityDefinition(lookup);
  const base: ListLookupConfig = {
    lookup,
    displayField: definition.defaultDisplayField,
    valueField: definition.defaultValueField,
    filters: {},
  };

  if (lookup === "available_slots") {
    return {
      ...base,
      filters: {
        service_id: "{{selected_service.id}}",
        resource_id: "{{selected_resource.id}}",
        date: "{{selected_date}}",
      },
    };
  }

  return base;
}

export function normalizeListNodeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const mode = readListDataSourceMode(config);

  if (mode === "lookup") {
    const lookupConfig = readListLookupConfig(config);
    const definition = lookupConfig ? getLookupEntityDefinition(lookupConfig.lookup) : null;
    const outputVariable =
      readString(config.outputVariable) ||
      readString(config.saveAs) ||
      readString(config.inputKey) ||
      definition?.variableName ||
      "";
    return {
      ...config,
      mode: "lookup",
      ...(lookupConfig ?? {}),
      ...(outputVariable
        ? { outputVariable, saveAs: outputVariable, inputKey: outputVariable }
        : {}),
    };
  }

  const saveAs = readString(config.saveAs) || readString(config.inputKey);
  return {
    ...config,
    mode: "manual",
    ...(saveAs ? { saveAs, inputKey: saveAs } : {}),
  };
}

export function validateListVariableBinding(config: Record<string, unknown>, nodeId: string): ValidationIssue[] {
  if (readListDataSourceMode(config) === "lookup") {
    const outputVariable = resolveLookupOutputVariableName(config);
    if (!outputVariable) {
      return [
        {
          id: `${nodeId}-lookup-output-variable`,
          nodeId,
          message: "Lookup lists require a valid output variable from the lookup registry.",
          severity: "error",
          fieldLabelKey: "saveSelectedValueAs",
        },
      ];
    }
    return [];
  }

  const saveAs = readString(config.saveAs);
  if (!saveAs) return [];

  if (!WORKFLOW_VARIABLE_NAME_PATTERN.test(saveAs)) {
    return [
      {
        id: `${nodeId}-saveAs-invalid`,
        nodeId,
        message: "Use a valid workflow variable name (letters, numbers, underscores; must start with a letter or underscore).",
        severity: "error",
        fieldLabelKey: "saveSelectedValueAs",
      },
    ];
  }

  return [];
}

export function validateListNodeOptions(config: Record<string, unknown>, nodeId: string): ValidationIssue[] {
  if (readListDataSourceMode(config) === "lookup") {
    const lookupConfig = readListLookupConfig(config);
    if (!lookupConfig) {
      return [
        {
          id: `${nodeId}-lookup-invalid`,
          nodeId,
          message: "Select a valid lookup type for this list node.",
          severity: "error",
          fieldLabelKey: "lookupType",
        },
      ];
    }
    if (!lookupConfig.displayField || !lookupConfig.valueField) {
      return [
        {
          id: `${nodeId}-lookup-fields`,
          nodeId,
          message: "Lookup lists require display and value fields.",
          severity: "error",
        },
      ];
    }
    return [];
  }

  const rows = Array.isArray(config.rows) ? config.rows : [];
  if (
    rows.filter(
      (row) => typeof row === "object" && String((row as { title?: string }).title ?? "").trim().length > 0,
    ).length === 0
  ) {
    return [
      {
        id: `${nodeId}-rows`,
        nodeId,
        message: "Add at least one list option before publishing.",
        severity: "error",
      },
    ];
  }

  return [];
}
