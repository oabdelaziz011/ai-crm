import type { AnalyticsAnalyzerRegistry } from "../analyzers/analyzer-registry";
import { createDefaultAnalyticsAnalyzerRegistry } from "../analyzers/register-built-in-analyzers";
import type { WorkflowKpiRegistry } from "../kpis/kpi-registry";
import { createDefaultWorkflowKpiRegistry } from "../kpis/register-built-in-kpis";
import type { WorkflowAnalyticsDataProvider } from "../providers/analytics-data-provider-types";
import type { WorkflowAnalyticsReportRegistry } from "./report/analytics-report-registry";
import { createWorkflowAnalyticsReportRegistry } from "./report/analytics-report-registry";
import type { WorkflowAnalyticsInput, WorkflowAnalyticsViewModel } from "../types/analytics-types";
import { createEmptyAnalyticsViewModel } from "../utilities/empty-analytics-view-model";

export class WorkflowAnalyticsService {
  constructor(
    private readonly analyzerRegistry: AnalyticsAnalyzerRegistry = createDefaultAnalyticsAnalyzerRegistry(),
    private readonly kpiRegistry: WorkflowKpiRegistry = createDefaultWorkflowKpiRegistry(),
    private readonly reportRegistry: WorkflowAnalyticsReportRegistry = createWorkflowAnalyticsReportRegistry(),
  ) {}

  buildViewModel(input: WorkflowAnalyticsInput): WorkflowAnalyticsViewModel {
    const analyzed = this.analyzerRegistry.analyzeAll(input);
    const empty = createEmptyAnalyticsViewModel();

    const dashboard = analyzed.dashboard ?? empty.dashboard;
    const coverage = analyzed.coverage ?? empty.coverage;

    const kpis = this.kpiRegistry.calculate({
      document: input.document,
      dashboard,
      coverage,
    });

    const partial: WorkflowAnalyticsViewModel = {
      dashboard,
      performance: analyzed.performance ?? empty.performance,
      trends: analyzed.trends ?? empty.trends,
      branches: analyzed.branches ?? empty.branches,
      triggers: analyzed.triggers ?? empty.triggers,
      failures: analyzed.failures ?? empty.failures,
      coverage,
      heatmap: analyzed.heatmap ?? empty.heatmap,
      kpis,
      report: empty.report,
    };

    return {
      ...partial,
      report: this.reportRegistry.buildReport(partial),
    };
  }

  buildViewModelFromProvider(provider: WorkflowAnalyticsDataProvider): WorkflowAnalyticsViewModel {
    return this.buildViewModel(provider.read());
  }
}

export const workflowAnalyticsService = new WorkflowAnalyticsService();

export function buildWorkflowAnalyticsViewModel(input: WorkflowAnalyticsInput): WorkflowAnalyticsViewModel {
  return workflowAnalyticsService.buildViewModel(input);
}

export function buildWorkflowAnalyticsViewModelFromProvider(
  provider: WorkflowAnalyticsDataProvider,
): WorkflowAnalyticsViewModel {
  return workflowAnalyticsService.buildViewModelFromProvider(provider);
}
