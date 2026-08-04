import type { IntelligenceRecommendation } from "../types/intelligence-types.js";
import type { OperationsRecommendationRuleConfig } from "../types/extended-config-types.js";
import type { OperationsCustomer360WorkspaceData } from "../types/customer360-panel-types.js";
import { OperationsRuntimeConfigurationError } from "../runtime/runtime-configuration-error.js";

export class RecommendationEngine {
  private readonly rules: OperationsRecommendationRuleConfig[];

  constructor(rules: OperationsRecommendationRuleConfig[]) {
    if (!rules.length) {
      throw new OperationsRuntimeConfigurationError(
        "configuration.intelligence.recommendationRules is required — no runtime recommendation fallback available",
      );
    }
    this.rules = rules;
  }

  generate(ctx: OperationsCustomer360WorkspaceData): IntelligenceRecommendation[] {
    const recs: IntelligenceRecommendation[] = [];
    for (const rule of this.rules.filter((r) => r.enabled)) {
      const evaluated = this.evaluateRule(rule.id, ctx);
      if (!evaluated || evaluated.confidence < rule.minConfidence) continue;
      recs.push({
        id: rule.id,
        title: rule.labelKey,
        reason: rule.reasonKey,
        confidence: evaluated.confidence,
        actionKey: rule.actionKey,
        labelKey: rule.labelKey,
      });
    }
    return recs.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  private evaluateRule(ruleId: string, ctx: OperationsCustomer360WorkspaceData): { confidence: number } | null {
    if (ruleId === "rec_collect" && ctx.outstandingBalanceCents > 0) return { confidence: 0.94 };
    if (
      ruleId === "rec_followup" &&
      ctx.bookings.some((b) => b.status === "Confirmed" && new Date(b.scheduledAt) > new Date())
    ) {
      return { confidence: 0.87 };
    }
    if (ruleId === "rec_upgrade" && ctx.summary.isVip) return { confidence: 0.78 };
    if (ruleId === "rec_reassign" && ctx.todaysOperation.countdownMinutes > 20) return { confidence: 0.81 };
    if (ruleId === "rec_whatsapp") return { confidence: 0.89 };
    if (ruleId === "rec_task") return { confidence: 0.76 };
    if (
      ruleId === "rec_escalate" &&
      (ctx.summary.riskLevel === "medium" || ctx.summary.riskLevel === "high")
    ) {
      return { confidence: 0.73 };
    }
    return null;
  }
}

