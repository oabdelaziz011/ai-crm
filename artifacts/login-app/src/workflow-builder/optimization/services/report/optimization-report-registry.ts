import type {
  OptimizationRecommendation,
  OptimizationReport,
  WorkflowOptimizationViewModel,
} from "../../types/optimization-types";

export type OptimizationReportSectionInput = {
  viewModel: WorkflowOptimizationViewModel;
};

export type OptimizationReportSectionResult = {
  exportFragment: Record<string, unknown>;
};

export type OptimizationReportSection = {
  id: string;
  build(input: OptimizationReportSectionInput): OptimizationReportSectionResult;
};

export type WorkflowOptimizationReportRegistry = {
  register(section: OptimizationReportSection): void;
  list(): readonly OptimizationReportSection[];
  buildReport(viewModel: WorkflowOptimizationViewModel): OptimizationReport;
};

function aggregateOptimizationReportSections(
  sections: readonly OptimizationReportSection[],
  input: OptimizationReportSectionInput,
): Record<string, unknown> {
  return sections.reduce<Record<string, unknown>>((payload, section) => {
    payload[section.id] = section.build(input).exportFragment;
    return payload;
  }, {});
}

export const executiveSummarySection: OptimizationReportSection = {
  id: "executiveSummary",
  build({ viewModel }) {
    const { dashboard } = viewModel;
    const summary =
      dashboard.recommendationCount === 0
        ? "Workflow is well-optimized with no advisory recommendations."
        : `Optimization score ${dashboard.optimizationScore}/100 with ${dashboard.recommendationCount} recommendation(s) (${dashboard.criticalCount} critical).`;
    return { exportFragment: { text: summary } };
  },
};

export const recommendationsSection: OptimizationReportSection = {
  id: "recommendations",
  build({ viewModel }) {
    return {
      exportFragment: {
        items: viewModel.recommendations.map((item) => ({
          id: item.id,
          category: item.category,
          severity: item.severity,
          title: item.title,
          impact: item.impact,
          confidence: item.confidence,
          affectedNodeIds: item.affectedNodeIds,
        })),
      },
    };
  },
};

export const scoreSection: OptimizationReportSection = {
  id: "score",
  build({ viewModel }) {
    return {
      exportFragment: {
        optimizationScore: viewModel.dashboard.optimizationScore,
        overallHealth: viewModel.dashboard.overallHealth,
        estimatedImpact: viewModel.dashboard.estimatedImpact,
      },
    };
  },
};

export const risksSection: OptimizationReportSection = {
  id: "risks",
  build({ viewModel }) {
    const risks = viewModel.recommendations
      .filter((item) => item.severity === "critical" || item.severity === "warning")
      .slice(0, 8)
      .map((item) => item.title);
    return { exportFragment: { risks } };
  },
};

export const opportunitiesSection: OptimizationReportSection = {
  id: "opportunities",
  build({ viewModel }) {
    const opportunities = viewModel.recommendations
      .filter((item) => item.severity === "info" || item.impact >= 50)
      .slice(0, 8)
      .map((item) => item.estimatedBenefit);
    return { exportFragment: { opportunities } };
  },
};

export const complexitySection: OptimizationReportSection = {
  id: "complexity",
  build({ viewModel }) {
    return { exportFragment: { complexity: viewModel.complexity } };
  },
};

export const builtInOptimizationReportSections: OptimizationReportSection[] = [
  executiveSummarySection,
  recommendationsSection,
  scoreSection,
  risksSection,
  opportunitiesSection,
  complexitySection,
];

export function createWorkflowOptimizationReportRegistry(
  sections: readonly OptimizationReportSection[] = builtInOptimizationReportSections,
): WorkflowOptimizationReportRegistry {
  const registry = new Map<string, OptimizationReportSection>();
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
      const sectionPayload = aggregateOptimizationReportSections(sectionList, { viewModel });
      const executiveSummary = sectionPayload.executiveSummary as { text: string } | undefined;
      const recommendations = sectionPayload.recommendations as { items: OptimizationRecommendation[] } | undefined;
      const score = sectionPayload.score as { optimizationScore: number; estimatedImpact: number } | undefined;
      const risks = sectionPayload.risks as { risks: string[] } | undefined;
      const opportunities = sectionPayload.opportunities as { opportunities: string[] } | undefined;

      return {
        executiveSummary: executiveSummary?.text ?? "",
        recommendations: recommendations?.items ?? viewModel.recommendations,
        score: score?.optimizationScore ?? viewModel.dashboard.optimizationScore,
        estimatedImpact: score?.estimatedImpact ?? viewModel.dashboard.estimatedImpact,
        risks: risks?.risks ?? [],
        opportunities: opportunities?.opportunities ?? [],
        exportPayload: {
          generatedAt: new Date().toISOString(),
          sections: sectionPayload,
          dashboard: viewModel.dashboard,
          complexity: viewModel.complexity,
          recommendations: viewModel.recommendations,
        },
      };
    },
  };
}

export const defaultWorkflowOptimizationReportRegistry = createWorkflowOptimizationReportRegistry();
