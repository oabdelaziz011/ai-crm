import type { ValidationIssue, WorkflowDocument } from "../../core/types";
import type { WorkflowAnalyticsViewModel } from "../../analytics/types/analytics-types";
import type { WorkflowOptimizationInput } from "../types/optimization-types";

export type AnalyticsOptimizationData = {
  analytics: WorkflowAnalyticsViewModel;
};

export type ValidationOptimizationData = {
  validationIssues: readonly ValidationIssue[];
};

export interface WorkflowOptimizationDataProvider {
  read(): WorkflowOptimizationInput;
}

export interface AnalyticsOptimizationProviderContract {
  readonly id: "analytics";
  read(): AnalyticsOptimizationData;
}

export interface ValidationOptimizationProviderContract {
  readonly id: "validation";
  read(): ValidationOptimizationData;
}

export type OptimizationDocumentContext = {
  document: WorkflowDocument;
};
