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

function collectMustacheBindings(map: Map<string, Set<string>>, value: string): void {
  for (const match of value.matchAll(BINDING_PATH_RE)) {
    const path = match[1];
    if (!path) continue;
    const [variable, ...rest] = path.split(".");
    if (!variable || rest.length === 0) continue;
    addRequirement(map, variable, rest.join("."));
  }
}

function collectFromBindingPath(map: Map<string, Set<string>>, value: string): void {
  collectMustacheBindings(map, value);

  // Bare dotted paths are only valid inside explicit variable bindings
  // (mode: "variable"). Free-form config strings like nodeKey "ai.decision"
  // must not be treated as workflow variable requirements.
  const dotted = value.match(DOT_PATH_RE);
  if (dotted?.[1] && dotted[2]) {
    addRequirement(map, dotted[1], dotted[2]);
  }
}

function walkConfigValue(map: Map<string, Set<string>>, value: unknown, depth = 0): void {
  if (depth > 8 || value == null) return;
  if (typeof value === "string") {
    collectMustacheBindings(map, value);
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
    if (variablePath) collectFromBindingPath(map, variablePath);
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
      "بعض بيانات الحجز ناقصة. من فضلك اختَر الخدمة/الوقت من القايمة مرة تانية.",
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
  // Interactive / AI workflow nodes produce variables — they do not consume booking slot contracts.
  // Their configs also contain dotted keys like "ai.decision" that must not be treated as bindings.
  if (
    action === "send_list" ||
    action === "send_buttons" ||
    action === "send_message" ||
    action === "ai_workflow"
  ) {
    return { ok: true };
  }

  const requirements = collectObjectFieldRequirements(input.config);
  const variables =
    action === "create_booking"
      ? enrichVariablesForCreateBookingContract(input.variables)
      : input.variables;
  return validateObjectFieldRequirements(variables, requirements);
}

/**
 * Booking wizards often store the chosen service/resource/slot under selected_* keys,
 * while older node configs still bind {{booking.service}}. Map the live selections so
 * validation matches what executeCreateBookingAction already resolves at runtime.
 */
export function enrichVariablesForCreateBookingContract(
  variables: Record<string, unknown>,
): Record<string, unknown> {
  const selectedSlot =
    variables.selected_slot && typeof variables.selected_slot === "object" && !Array.isArray(variables.selected_slot)
      ? (variables.selected_slot as Record<string, unknown>)
      : null;
  const selectedService =
    variables.selected_service &&
    typeof variables.selected_service === "object" &&
    !Array.isArray(variables.selected_service)
      ? (variables.selected_service as Record<string, unknown>)
      : null;
  const selectedResource =
    variables.selected_resource &&
    typeof variables.selected_resource === "object" &&
    !Array.isArray(variables.selected_resource)
      ? (variables.selected_resource as Record<string, unknown>)
      : null;
  const selectedDate =
    variables.selected_date && typeof variables.selected_date === "object" && !Array.isArray(variables.selected_date)
      ? (variables.selected_date as Record<string, unknown>)
      : null;

  const serviceId =
    (typeof selectedSlot?.service_id === "string" && selectedSlot.service_id.trim()) ||
    (typeof selectedService?.id === "string" && selectedService.id.trim()) ||
    null;
  const resourceId =
    (typeof selectedSlot?.resource_id === "string" && selectedSlot.resource_id.trim()) ||
    (typeof selectedResource?.id === "string" && selectedResource.id.trim()) ||
    null;

  const existingBooking =
    variables.booking && typeof variables.booking === "object" && !Array.isArray(variables.booking)
      ? (variables.booking as Record<string, unknown>)
      : {};

  return {
    ...variables,
    booking: {
      ...existingBooking,
      ...(serviceId && existingBooking.service == null ? { service: serviceId } : {}),
      ...(resourceId && existingBooking.doctor == null ? { doctor: resourceId } : {}),
      ...(typeof selectedSlot?.start_at === "string" && existingBooking.appointmentTime == null
        ? { appointmentTime: selectedSlot.start_at }
        : {}),
      ...(typeof selectedDate?.date === "string" && existingBooking.appointmentDate == null
        ? { appointmentDate: selectedDate.date }
        : {}),
    },
  };
}
