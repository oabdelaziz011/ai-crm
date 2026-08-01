import { createAnalyticsAnalyzerRegistry } from "./analyzer-registry";
import { builtInAnalyzers } from "./built-in-analyzers";

export const defaultAnalyticsAnalyzerRegistry = createAnalyticsAnalyzerRegistry(builtInAnalyzers);

export function createDefaultAnalyticsAnalyzerRegistry() {
  return defaultAnalyticsAnalyzerRegistry;
}
