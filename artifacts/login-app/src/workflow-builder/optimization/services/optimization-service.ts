import type { OptimizationRuleRegistry } from "../rules/optimization-rule-registry";
import { createDefaultOptimizationRuleRegistry } from "../rules/register-built-in-optimization-rules";
import type { WorkflowOptimizationDataProvider } from "../providers/optimization-data-provider-types";
import type { WorkflowOptimizationInput, WorkflowOptimizationViewModel } from "../types/optimization-types";
import { analyzeComplexity } from "./built-in-optimizers";
import { buildOptimizationDashboard } from "./optimization-score-calculator";
import { prioritizeRecommendations } from "./recommendation-prioritizer";
import type { WorkflowOptimizationReportRegistry } from "./report/optimization-report-registry";
import { createWorkflowOptimizationReportRegistry } from "./report/optimization-report-registry";
import { createEmptyOptimizationViewModel } from "../utilities/empty-optimization-view-model";

export class WorkflowOptimizationService {
  constructor(
    private readonly ruleRegistry: OptimizationRuleRegistry = createDefaultOptimizationRuleRegistry(),
    private readonly reportRegistry: WorkflowOptimizationReportRegistry = createWorkflowOptimizationReportRegistry(),
  ) {}

  buildViewModel(input: WorkflowOptimizationInput): WorkflowOptimizationViewModel {
    const empty = createEmptyOptimizationViewModel();
    const rawRecommendations = this.ruleRegistry.evaluateAll(input);
    const recommendations = prioritizeRecommendations(rawRecommendations);
    const complexity = analyzeComplexity(input);
    const dashboard = buildOptimizationDashboard(recommendations);

    const partial: WorkflowOptimizationViewModel = {
      dashboard,
      recommendations,
      complexity,
      report: empty.report,
    };

    return {
      ...partial,
      report: this.reportRegistry.buildReport(partial),
    };
  }

  buildViewModelFromProvider(provider: WorkflowOptimizationDataProvider): WorkflowOptimizationViewModel {
    return this.buildViewModel(provider.read());
  }
}

export const workflowOptimizationService = new WorkflowOptimizationService();

export function buildWorkflowOptimizationViewModel(input: WorkflowOptimizationInput): WorkflowOptimizationViewModel {
  return workflowOptimizationService.buildViewModel(input);
}

export function buildWorkflowOptimizationViewModelFromProvider(
  provider: WorkflowOptimizationDataProvider,
): WorkflowOptimizationViewModel {
  return workflowOptimizationService.buildViewModelFromProvider(provider);
}
