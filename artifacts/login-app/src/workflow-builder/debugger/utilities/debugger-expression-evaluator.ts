import type { SimulationSnapshot } from "../../simulation/types/simulation-types";

export type ExpressionEvaluationResult = {
  value: unknown;
  displayValue: string;
  error: string | null;
};

function formatDisplayValue(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function readVariableValue(variables: Readonly<Record<string, unknown>>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(variables, key)) {
    return variables[key];
  }

  const segments = key.split(".");
  let current: unknown = variables;
  for (const segment of segments) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function parseLiteral(token: string): unknown {
  const trimmed = token.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function compareValues(left: unknown, operator: string, right: unknown): boolean {
  switch (operator) {
    case "==":
      return left == right;
    case "!=":
      return left != right;
    case ">":
      return Number(left) > Number(right);
    case ">=":
      return Number(left) >= Number(right);
    case "<":
      return Number(left) < Number(right);
    case "<=":
      return Number(left) <= Number(right);
    default:
      return false;
  }
}

export function evaluateDebuggerExpression(
  expression: string,
  snapshot: Readonly<Pick<SimulationSnapshot, "variables">>,
): ExpressionEvaluationResult {
  const trimmed = expression.trim();
  if (!trimmed) {
    return { value: null, displayValue: "—", error: "Expression is empty." };
  }

  try {
    const comparisonMatch = trimmed.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (comparisonMatch) {
      const [, leftToken, operator, rightToken] = comparisonMatch;
      const leftValue = resolveExpressionToken(leftToken!.trim(), snapshot.variables);
      const rightValue = parseLiteral(rightToken!.trim());
      const result = compareValues(leftValue, operator!, rightValue);
      return { value: result, displayValue: formatDisplayValue(result), error: null };
    }

    const value = resolveExpressionToken(trimmed, snapshot.variables);
    return { value, displayValue: formatDisplayValue(value), error: null };
  } catch (error) {
    return {
      value: null,
      displayValue: "—",
      error: error instanceof Error ? error.message : "Unable to evaluate expression.",
    };
  }
}

function resolveExpressionToken(token: string, variables: Readonly<Record<string, unknown>>): unknown {
  if (/^-?\d+(?:\.\d+)?$/.test(token) || token === "true" || token === "false" || token === "null") {
    return parseLiteral(token);
  }
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return parseLiteral(token);
  }
  return readVariableValue(variables, token);
}
