/**
 * Engine-level workflow variable contracts.
 * Validates that object-field bindings resolve against object variables
 * before node handlers execute — independent of clinic/domain specifics.
 */

export type WorkflowVariableFieldRequirement = {
  variable: string;
  fields: string[];
};

export type WorkflowContractViolation = {
  variable: string;
  missingFields: string[];
  actualKind: "missing" | "string" | "number" | "boolean" | "array" | "object" | "other";
  message: string;
};

export type WorkflowContractValidationResult =
  | { ok: true }
  | { ok: false; violations: WorkflowContractViolation[]; userMessage: string };

const BINDING_PATH_RE = /\{\{\s*([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)+)\s*\}\}/g;
const DOT_PATH_RE = /^([a-zA-Z_][\w]*)\.([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*)$/;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function addRequirement(
  map: Map<string, Set<string>>,
  variable: string,
  fieldPath: string,
): void {
  const rootField = fieldPath.split(".")[0]?.trim();
  if (!rootField) return;
  let fields = map.get(variable);
  if (!fields) {
    fields = new Set<string>();
    map.set(variable, fields);
  }
  fields.add(rootField);
}

function collectFromString(map: Map<string, Set<string>>, value: string): void {
  for (const match of value.matchAll(BINDING_PATH_RE)) {
    const path = match[1];
    if (!path) continue;
    const [variable, ...rest] = path.split(".");
    if (!variable || rest.length === 0) continue;
    addRequirement(map, variable, rest.join("."));
  }

  const dotted = value.match(DOT_PATH_RE);
  if (dotted?.[1] && dotted[2]) {
    addRequirement(map, dotted[1], dotted[2]);
  }
}

function walkConfigValue(map: Map<string, Set<string>>, value: unknown, depth = 0): void {
  if (depth > 8 || value == null) return;
  if (typeof value === "string") {
    collectFromString(map, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) walkConfigValue(map, entry, depth + 1);
    return;
  }
  if (typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const mode = readString(record.mode);
  if (mode === "variable") {
    const variablePath = readString(record.variable) ?? readString(record.path);
    if (variablePath) collectFromString(map, variablePath.includes("{{") ? variablePath : variablePath);
  }

  for (const nested of Object.values(record)) {
    walkConfigValue(map, nested, depth + 1);
  }
}

/** Extract object-field requirements from a node config's bindings. */
export function collectObjectFieldRequirements(
  config: Record<string, unknown>,
): WorkflowVariableFieldRequirement[] {
  const map = new Map<string, Set<string>>();
  walkConfigValue(map, config);
  return [...map.entries()].map(([variable, fields]) => ({
    variable,
    fields: [...fields],
  }));
}

function describeActualKind(value: unknown): WorkflowContractViolation["actualKind"] {
  if (value === undefined || value === null) return "missing";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return "other";
}

export function validateObjectFieldRequirements(
  variables: Record<string, unknown>,
  requirements: WorkflowVariableFieldRequirement[],
): WorkflowContractValidationResult {
  if (requirements.length === 0) return { ok: true };

  const violations: WorkflowContractViolation[] = [];

  for (const requirement of requirements) {
    const value = variables[requirement.variable];
    const actualKind = describeActualKind(value);

    if (actualKind !== "object") {
      violations.push({
        variable: requirement.variable,
        missingFields: requirement.fields,
        actualKind,
        message: `Variable "${requirement.variable}" must be an object with field(s) ${requirement.fields.join(", ")}, but received ${actualKind}.`,
      });
      continue;
    }

    const record = value as Record<string, unknown>;
    const missingFields = requirement.fields.filter((field) => {
      const fieldValue = record[field];
      return fieldValue === undefined || fieldValue === null || fieldValue === "";
    });

    if (missingFields.length > 0) {
      violations.push({
        variable: requirement.variable,
        missingFields,
        actualKind: "object",
        message: `Variable "${requirement.variable}" is missing required field(s): ${missingFields.join(", ")}.`,
      });
    }
  }

  if (violations.length === 0) return { ok: true };

  return {
    ok: false,
    violations,
    userMessage:
      "Some required booking details are incomplete. Please choose your options from the list again.",
  };
}

export function validateNodeVariableContract(input: {
  nodeType: string;
  config: Record<string, unknown>;
  variables: Record<string, unknown>;
}): WorkflowContractValidationResult {
  // Only enforce object-field contracts for action nodes that consume bindings.
  if (input.nodeType !== "action") return { ok: true };
  const action = readString(input.config.action) ?? readString(input.config.builderType);
  // Interactive list nodes produce variables — they do not consume slot contracts.
  if (action === "send_list" || action === "send_buttons" || action === "send_message") {
    return { ok: true };
  }

  const requirements = collectObjectFieldRequirements(input.config);
  return validateObjectFieldRequirements(input.variables, requirements);
}
