import type {
  WorkflowAnalyticsDashboard,
  WorkflowAnalyticsReport,
  WorkflowAnalyticsViewModel,
  WorkflowCoverageAnalytics,
  WorkflowFailureAnalytics,
  WorkflowKpiDashboard,
  WorkflowPerformanceMetrics,
  WorkflowTrendPoint,
} from "../../types/analytics-types";

export type AnalyticsReportSectionInput = {
  viewModel: WorkflowAnalyticsViewModel;
};

export type AnalyticsReportSectionResult = {
  exportFragment: Record<string, unknown>;
};

export type AnalyticsReportSection = {
  id: string;
  build(input: AnalyticsReportSectionInput): AnalyticsReportSectionResult;
};

export type WorkflowAnalyticsReportRegistry = {
  register(section: AnalyticsReportSection): void;
  list(): readonly AnalyticsReportSection[];
  buildReport(viewModel: WorkflowAnalyticsViewModel): WorkflowAnalyticsReport;
};

export function aggregateAnalyticsReportSections(
  sections: readonly AnalyticsReportSection[],
  input: AnalyticsReportSectionInput,
): Record<string, unknown> {
  return sections.reduce<Record<string, unknown>>((payload, section) => {
    payload[section.id] = section.build(input).exportFragment;
    return payload;
  }, {});
}

export const summarySection: AnalyticsReportSection = {
  id: "summary",
  build({ viewModel }) {
    return {
      exportFragment: {
        dashboard: viewModel.dashboard,
        kpis: viewModel.kpis,
      },
    };
  },
};

export const metricsSection: AnalyticsReportSection = {
  id: "metrics",
  build({ viewModel }) {
    return {
      exportFragment: { performance: viewModel.performance },
    };
  },
};

export const trendSection: AnalyticsReportSection = {
  id: "trends",
  build({ viewModel }) {
    return {
      exportFragment: { points: viewModel.trends },
    };
  },
};

export const coverageSection: AnalyticsReportSection = {
  id: "coverage",
  build({ viewModel }) {
    return {
      exportFragment: { coverage: viewModel.coverage },
    };
  },
};

export const failureSection: AnalyticsReportSection = {
  id: "failures",
  build({ viewModel }) {
    return {
      exportFragment: { failures: viewModel.failures },
    };
  },
};

export const heatmapSection: AnalyticsReportSection = {
  id: "heatmap",
  build({ viewModel }) {
    return {
      exportFragment: {
        heatmap: viewModel.heatmap,
        bottlenecks: viewModel.heatmap.filter((entry) => entry.isBottleneck).map((entry) => entry.label),
      },
    };
  },
};

export const recommendationSection: AnalyticsReportSection = {
  id: "recommendations",
  build({ viewModel }) {
    const recommendations: string[] = [];
    if (viewModel.dashboard.failedTests > 0) {
      recommendations.push("Review failed regression cases before publishing.");
    }
    if (viewModel.branches.neverExecutedBranches.length > 0) {
      recommendations.push("Add tests for never-executed branches.");
    }
    if (viewModel.coverage.nodeCoveragePercent < 80) {
      recommendations.push("Increase node coverage with additional test cases.");
    }
    if (viewModel.kpis.stability < 70) {
      recommendations.push("Stabilize workflow by addressing recurring assertion failures.");
    }
    return { exportFragment: { recommendations } };
  },
};

export const builtInAnalyticsReportSections: AnalyticsReportSection[] = [
  summarySection,
  metricsSection,
  trendSection,
  coverageSection,
  failureSection,
  heatmapSection,
  recommendationSection,
];

export function createWorkflowAnalyticsReportRegistry(
  sections: readonly AnalyticsReportSection[] = builtInAnalyticsReportSections,
): WorkflowAnalyticsReportRegistry {
  const registry = new Map<string, AnalyticsReportSection>();
  for (const section of sections) {
    registry.set(section.id, section);
  }

  return {
    register(section) {
      registry.set(section.id, section);
    },
    list() {
      return [...registry.values()];
    },
    buildReport(viewModel) {
      const sectionList = [...registry.values()];
      const sectionPayload = aggregateAnalyticsReportSections(sectionList, { viewModel });
      const summary = sectionPayload.summary as { dashboard: WorkflowAnalyticsDashboard; kpis: WorkflowKpiDashboard } | undefined;
      const metrics = sectionPayload.metrics as { performance: WorkflowPerformanceMetrics } | undefined;
      const trends = sectionPayload.trends as { points: WorkflowTrendPoint[] } | undefined;
      const coverage = sectionPayload.coverage as { coverage: WorkflowCoverageAnalytics } | undefined;
      const failures = sectionPayload.failures as { failures: WorkflowFailureAnalytics } | undefined;
      const heatmap = sectionPayload.heatmap as { bottlenecks: string[] } | undefined;
      const recommendations = sectionPayload.recommendations as { recommendations: string[] } | undefined;

      return {
        summary: summary ?? {},
        metrics: metrics ?? {},
        trends: trends ?? {},
        coverage: coverage ?? {},
        failures: failures ?? {},
        bottlenecks: heatmap?.bottlenecks ?? [],
        recommendations: recommendations?.recommendations ?? [],
        exportPayload: {
          generatedAt: new Date().toISOString(),
          sections: sectionPayload,
          dashboard: viewModel.dashboard,
          performance: viewModel.performance,
          trends: viewModel.trends,
          coverage: viewModel.coverage,
          failures: viewModel.failures,
          heatmap: viewModel.heatmap,
          kpis: viewModel.kpis,
          triggers: viewModel.triggers,
          branches: viewModel.branches,
        },
      };
    },
  };
}

export const defaultWorkflowAnalyticsReportRegistry = createWorkflowAnalyticsReportRegistry();

export function buildAnalyticsReport(viewModel: WorkflowAnalyticsViewModel): WorkflowAnalyticsReport {
  return defaultWorkflowAnalyticsReportRegistry.buildReport(viewModel);
}
