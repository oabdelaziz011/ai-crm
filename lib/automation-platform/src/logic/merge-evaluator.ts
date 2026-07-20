import type { MergeStrategy } from "./types.js";

export type MergeEvaluator = {
  id: MergeStrategy;
  label: string;
  canProceed: (joinedPaths: number, expectedPaths: number) => boolean;
};

const evaluators = new Map<MergeStrategy, MergeEvaluator>();

export function registerMergeEvaluator(evaluator: MergeEvaluator): void {
  evaluators.set(evaluator.id, evaluator);
}

export function getMergeEvaluator(strategy: MergeStrategy): MergeEvaluator {
  const evaluator = evaluators.get(strategy);
  if (!evaluator) throw new Error(`Unknown merge strategy: ${strategy}`);
  return evaluator;
}

export function registerBuiltInMergeEvaluators(): void {
  if (evaluators.size > 0) return;
  registerMergeEvaluator({
    id: "all",
    label: "Wait All",
    canProceed: (joined, expected) => joined >= expected,
  });
  registerMergeEvaluator({
    id: "any",
    label: "Wait Any",
    canProceed: (joined) => joined >= 1,
  });
}
