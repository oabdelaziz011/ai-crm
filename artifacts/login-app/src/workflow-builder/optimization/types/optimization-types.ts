import type { ValidationIssue, WorkflowDocument } from "../../core/types";
import type { WorkflowAnalyticsViewModel } from "../../analytics/types/analytics-types";

export type OptimizationSeverity = "info" | "warning" | "critical";

export type OptimizationCategory =
  | "performance"
  | "structure"
  | "ai"
  | "trigger"
  | "reliability"
  | "complexity"
  | "branch";

export type OptimizationHealthStatus = "healthy" | "warning" | "critical" | "unknown";

export type OptimizationRecommendation = {
  id: string;
  category: OptimizationCategory;
  severity: OptimizationSeverity;
  title: string;
  description: string;
  impact: number;
  confidence: number;
  estimatedBenefit: string;
  affectedNodeIds: readonly string[];
};

export type OptimizationDashboard = {
  optimizationScore: number;
  overallHealth: OptimizationHealthStatus;
  estimatedImpact: number;
  recommendationCount: number;
  criticalCount: number;
  warningCount: number;
};

export type ComplexityAnalysis = {
  graphComplexity: number;
  branchingComplexity: number;
  maintainability: number;
  readability: number;
  nodeCount: number;
  edgeCount: number;
  branchCount: number;
};

export type OptimizationReport = {
  executiveSummary: string;
  recommendations: readonly OptimizationRecommendation[];
  score: number;
  estimatedImpact: number;
  risks: readonly string[];
  opportunities: readonly string[];
  exportPayload: Record<string, unknown>;
};

export type WorkflowOptimizationViewModel = {
  dashboard: OptimizationDashboard;
  recommendations: readonly OptimizationRecommendation[];
  complexity: ComplexityAnalysis;
  report: OptimizationReport;
};

export type WorkflowOptimizationInput = {
  document: WorkflowDocument;
  analytics: WorkflowAnalyticsViewModel;
  validationIssues: readonly ValidationIssue[];
};
