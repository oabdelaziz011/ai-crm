import {
  analyzeAiCostRecommendations,
  analyzeBranchRecommendations,
  analyzeComplexityRecommendations,
  analyzePerformanceRecommendations,
  analyzeReliabilityRecommendations,
  analyzeStructureRecommendations,
  analyzeTriggerRecommendations,
} from "../services/built-in-optimizers";
import type { OptimizationRule } from "./optimization-rule-registry";

export const performanceOptimizationRule: OptimizationRule = {
  id: "performance",
  evaluate: analyzePerformanceRecommendations,
};

export const structureOptimizationRule: OptimizationRule = {
  id: "structure",
  evaluate: analyzeStructureRecommendations,
};

export const aiCostOptimizationRule: OptimizationRule = {
  id: "ai-cost",
  evaluate: analyzeAiCostRecommendations,
};

export const branchOptimizationRule: OptimizationRule = {
  id: "branch",
  evaluate: analyzeBranchRecommendations,
};

export const triggerOptimizationRule: OptimizationRule = {
  id: "trigger",
  evaluate: analyzeTriggerRecommendations,
};

export const reliabilityOptimizationRule: OptimizationRule = {
  id: "reliability",
  evaluate: analyzeReliabilityRecommendations,
};

export const complexityOptimizationRule: OptimizationRule = {
  id: "complexity",
  evaluate: analyzeComplexityRecommendations,
};

export const builtInOptimizationRules: OptimizationRule[] = [
  performanceOptimizationRule,
  structureOptimizationRule,
  aiCostOptimizationRule,
  branchOptimizationRule,
  triggerOptimizationRule,
  reliabilityOptimizationRule,
  complexityOptimizationRule,
];
