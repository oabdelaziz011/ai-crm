import { getLookupEntityDefinition, isLookupEntityId } from "./registry";
import type { LookupEntityDefinition, LookupOutputFieldDefinition } from "./types";

export function readListLookupEntityDefinition(
  config: Record<string, unknown>,
): LookupEntityDefinition | null {
  const lookup = typeof config.lookup === "string" ? config.lookup.trim() : "";
  if (!isLookupEntityId(lookup)) return null;
  return getLookupEntityDefinition(lookup);
}

export function resolveLookupOutputVariableName(config: Record<string, unknown>): string | null {
  const explicit =
    typeof config.outputVariable === "string"
      ? config.outputVariable.trim()
      : typeof config.saveAs === "string"
        ? config.saveAs.trim()
        : typeof config.inputKey === "string"
          ? config.inputKey.trim()
          : "";
  if (explicit) return explicit;

  const definition = readListLookupEntityDefinition(config);
  return definition?.variableName ?? null;
}

export function pickLookupOutputRecord(
  record: Record<string, unknown>,
  outputFields: LookupOutputFieldDefinition[],
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const field of outputFields) {
    if (Object.prototype.hasOwnProperty.call(record, field.id)) {
      output[field.id] = record[field.id];
    }
  }
  return output;
}

export function buildLookupOutputVariableSchema(definition: LookupEntityDefinition) {
  return {
    variableName: definition.variableName,
    displayNameKey: definition.displayNameKey,
    outputFields: definition.outputFields,
    fieldTypes: Object.fromEntries(definition.outputFields.map((field) => [field.id, field.type])),
  };
}
