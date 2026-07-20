import type { EvaluationContext } from "./types.js";

export type ExpressionFunction = {
  id: string;
  label: string;
  evaluate: (context: EvaluationContext, args?: unknown[]) => unknown;
};

const functions = new Map<string, ExpressionFunction>();

export function registerExpressionFunction(fn: ExpressionFunction): void {
  functions.set(fn.id, fn);
}

export function getExpressionFunction(id: string): ExpressionFunction | undefined {
  return functions.get(id);
}

export function listExpressionFunctions(): ExpressionFunction[] {
  return [...functions.values()];
}
