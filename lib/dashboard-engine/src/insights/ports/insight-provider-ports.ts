import type { DashboardSnapshot } from "../../types.js";
import type { DashboardExecutiveInsightBundle } from "../insight-types.js";

export type DashboardInsightContext = {
  companyId: string;
  generatedAt?: string;
};

export interface InsightProvider {
  generate(snapshot: DashboardSnapshot, context: DashboardInsightContext): DashboardExecutiveInsightBundle;
}

/** Reserved for future LLM-backed insight generation. */
export interface LLMInsightProvider extends InsightProvider {
  readonly providerKind: "llm";
}

/** Reserved for future forecast-driven insights. */
export interface ForecastProvider {
  generateForecastInsights(snapshot: DashboardSnapshot): DashboardExecutiveInsightBundle["insights"];
}

/** Reserved for future dedicated anomaly providers. */
export interface AnomalyProvider {
  detectAnomalies(snapshot: DashboardSnapshot): DashboardExecutiveInsightBundle["insights"];
}

/** Reserved for future dedicated recommendation providers. */
export interface RecommendationProvider {
  generateRecommendations(snapshot: DashboardSnapshot): DashboardExecutiveInsightBundle["summary"]["immediateActions"];
}
