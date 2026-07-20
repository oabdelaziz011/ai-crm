import type { LogicOperatorId } from "./types.js";

export type OperatorDefinition = {
  id: LogicOperatorId;
  label: string;
  requiresValue: boolean;
  requiresSecondValue?: boolean;
  evaluate: (actual: unknown, value?: unknown, valueTo?: unknown) => boolean;
};

const registry = new Map<LogicOperatorId, OperatorDefinition>();

export function registerOperator(definition: OperatorDefinition): void {
  registry.set(definition.id, definition);
}

export function getOperator(id: LogicOperatorId): OperatorDefinition {
  const operator = registry.get(id);
  if (!operator) throw new Error(`Unknown logic operator: ${id}`);
  return operator;
}

export function listOperators(): OperatorDefinition[] {
  registerBuiltInOperators();
  return [...registry.values()];
}

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

export function registerBuiltInOperators(): void {
  if (registry.size > 0) return;

  registerOperator({
    id: "equals",
    label: "Equals",
    requiresValue: true,
    evaluate: (actual, value) => asString(actual) === asString(value),
  });
  registerOperator({
    id: "not_equals",
    label: "Not Equals",
    requiresValue: true,
    evaluate: (actual, value) => asString(actual) !== asString(value),
  });
  registerOperator({
    id: "contains",
    label: "Contains",
    requiresValue: true,
    evaluate: (actual, value) => asString(actual).toLowerCase().includes(asString(value).toLowerCase()),
  });
  registerOperator({
    id: "not_contains",
    label: "Does Not Contain",
    requiresValue: true,
    evaluate: (actual, value) => !asString(actual).toLowerCase().includes(asString(value).toLowerCase()),
  });
  registerOperator({
    id: "starts_with",
    label: "Starts With",
    requiresValue: true,
    evaluate: (actual, value) => asString(actual).toLowerCase().startsWith(asString(value).toLowerCase()),
  });
  registerOperator({
    id: "ends_with",
    label: "Ends With",
    requiresValue: true,
    evaluate: (actual, value) => asString(actual).toLowerCase().endsWith(asString(value).toLowerCase()),
  });
  registerOperator({
    id: "is_empty",
    label: "Is Empty",
    requiresValue: false,
    evaluate: (actual) => actual == null || asString(actual).trim() === "",
  });
  registerOperator({
    id: "is_not_empty",
    label: "Is Not Empty",
    requiresValue: false,
    evaluate: (actual) => !(actual == null || asString(actual).trim() === ""),
  });
  registerOperator({
    id: "greater_than",
    label: "Greater Than",
    requiresValue: true,
    evaluate: (actual, value) => {
      const left = asNumber(actual);
      const right = asNumber(value);
      return left != null && right != null && left > right;
    },
  });
  registerOperator({
    id: "greater_than_or_equal",
    label: "Greater Than Or Equal",
    requiresValue: true,
    evaluate: (actual, value) => {
      const left = asNumber(actual);
      const right = asNumber(value);
      return left != null && right != null && left >= right;
    },
  });
  registerOperator({
    id: "less_than",
    label: "Less Than",
    requiresValue: true,
    evaluate: (actual, value) => {
      const left = asNumber(actual);
      const right = asNumber(value);
      return left != null && right != null && left < right;
    },
  });
  registerOperator({
    id: "less_than_or_equal",
    label: "Less Than Or Equal",
    requiresValue: true,
    evaluate: (actual, value) => {
      const left = asNumber(actual);
      const right = asNumber(value);
      return left != null && right != null && left <= right;
    },
  });
  registerOperator({
    id: "between",
    label: "Between",
    requiresValue: true,
    requiresSecondValue: true,
    evaluate: (actual, value, valueTo) => {
      const current = asNumber(actual);
      const min = asNumber(value);
      const max = asNumber(valueTo);
      return current != null && min != null && max != null && current >= min && current <= max;
    },
  });
  registerOperator({
    id: "in_list",
    label: "In List",
    requiresValue: true,
    evaluate: (actual, value) => parseList(value).map(asString).includes(asString(actual)),
  });
  registerOperator({
    id: "not_in_list",
    label: "Not In List",
    requiresValue: true,
    evaluate: (actual, value) => !parseList(value).map(asString).includes(asString(actual)),
  });
  registerOperator({
    id: "boolean_true",
    label: "Boolean True",
    requiresValue: false,
    evaluate: (actual) => actual === true || asString(actual).toLowerCase() === "true",
  });
  registerOperator({
    id: "boolean_false",
    label: "Boolean False",
    requiresValue: false,
    evaluate: (actual) => actual === false || asString(actual).toLowerCase() === "false",
  });
}
