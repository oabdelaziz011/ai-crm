import type { DashboardInsight, DashboardRecommendedAction } from "./insight-types.js";

let actionCounter = 0;

function nextActionId(prefix: string): string {
  actionCounter += 1;
  return `${prefix}-${actionCounter}`;
}

export class RecommendationEngine {
  attachRecommendations(insights: DashboardInsight[]): DashboardInsight[] {
    return insights.map((insight) => ({
      ...insight,
      recommendedActions: [
        ...insight.recommendedActions,
        ...this.recommendationsForInsight(insight),
      ],
    }));
  }

  recommendationsForInsight(insight: DashboardInsight): DashboardRecommendedAction[] {
    const actions: DashboardRecommendedAction[] = [];

    if (insight.category === "support" || insight.affectedMetrics.includes("support.tickets.open")) {
      actions.push({
        id: nextActionId("assign-agents"),
        actionType: "assign_agents",
        label: "Assign more agents",
        description: "Increase support coverage to reduce the open ticket backlog.",
        category: "support",
        priority: 90,
        relatedMetrics: ["support.tickets.open"],
      });
      actions.push({
        id: nextActionId("check-sla"),
        actionType: "check_sla_backlog",
        label: "Check SLA backlog",
        description: "Review tickets breaching SLA and prioritize urgent cases.",
        category: "support",
        priority: 88,
        relatedMetrics: ["support.sla.compliance", "support.tickets.open"],
      });
      actions.push({
        id: nextActionId("improve-response"),
        actionType: "improve_response_time",
        label: "Improve response time",
        description: "Audit first-response workflows and staffing during peak hours.",
        category: "support",
        priority: 84,
        relatedMetrics: ["support.response.avg_minutes"],
      });
    }

    if (insight.category === "automation" || insight.affectedMetrics.includes("automation.failure")) {
      actions.push({
        id: nextActionId("review-automation"),
        actionType: "review_automation",
        label: "Review automation",
        description: "Inspect failing workflow definitions and recent execution errors.",
        category: "automation",
        priority: 86,
        relatedMetrics: ["automation.failure", "automation.runs"],
      });
      actions.push({
        id: nextActionId("review-workflows"),
        actionType: "review_failed_workflows",
        label: "Review failed workflows",
        description: "Triage failed executions and rollback unstable workflow changes.",
        category: "automation",
        priority: 85,
        relatedMetrics: ["automation.failure"],
      });
    }

    if (insight.category === "channels") {
      actions.push({
        id: nextActionId("launch-campaign"),
        actionType: "launch_campaign",
        label: "Launch campaign",
        description: "Review channel delivery settings before launching the next outbound campaign.",
        category: "marketing",
        priority: 65,
        relatedMetrics: insight.affectedMetrics,
      });
    }

    if (insight.category === "finance" || insight.affectedMetrics.includes("invoices.outstanding")) {
      actions.push({
        id: nextActionId("review-invoices"),
        actionType: "review_unpaid_invoices",
        label: "Review unpaid invoices",
        description: "Prioritize collections on overdue and unpaid invoice accounts.",
        category: "finance",
        priority: 87,
        relatedMetrics: ["invoices.outstanding", "finance.revenue"],
      });
    }

    if (insight.category === "revenue") {
      actions.push({
        id: nextActionId("investigate-revenue"),
        actionType: "investigate_revenue_decline",
        label: "Investigate revenue decline",
        description: "Compare paid invoice trends, pipeline value, and booking conversion.",
        category: "revenue",
        priority: 95,
        relatedMetrics: ["finance.revenue", "crm.pipeline.value"],
      });
    }

    if (insight.category === "customers") {
      actions.push({
        id: nextActionId("increase-follow-up"),
        actionType: "increase_follow_up",
        label: "Increase follow-up",
        description: "Launch retention outreach for at-risk and inactive customer segments.",
        category: "customers",
        priority: 80,
        relatedMetrics: ["crm.customers.total", "crm.customers.active"],
      });
      actions.push({
        id: nextActionId("review-churn"),
        actionType: "review_customer_churn",
        label: "Review customer churn",
        description: "Analyze recent customer losses and re-engagement opportunities.",
        category: "customers",
        priority: 78,
        relatedMetrics: ["crm.customers.total", "crm.customers.new"],
      });
    }

    if (insight.category === "ai") {
      actions.push({
        id: nextActionId("optimize-ai"),
        actionType: "optimize_ai_workflows",
        label: "Optimize AI workflows",
        description: "Review low-confidence AI conversations and tool routing policies.",
        category: "ai",
        priority: 76,
        relatedMetrics: ["ai.success_rate", "ai.conversations", "ai.tool_calls"],
      });
    }

    if (insight.category === "knowledge") {
      actions.push({
        id: nextActionId("review-knowledge"),
        actionType: "review_knowledge_gaps",
        label: "Review knowledge gaps",
        description: "Inspect retrieval misses and update high-traffic knowledge sources.",
        category: "knowledge",
        priority: 60,
        relatedMetrics: ["knowledge.searches", "knowledge.retrieval.success_rate"],
      });
    }

    if (insight.insightType === "opportunity" || insight.insightType === "positive_trend") {
      actions.push({
        id: nextActionId("launch-campaign-opportunity"),
        actionType: "launch_campaign",
        label: "Launch campaign",
        description: "Capitalize on positive momentum with a targeted growth campaign.",
        category: insight.category === "channels" ? "marketing" : "sales",
        priority: 55,
        relatedMetrics: insight.affectedMetrics,
      });
    }

    return dedupeActions(actions);
  }

  collectImmediateActions(insights: DashboardInsight[]): DashboardRecommendedAction[] {
    return dedupeActions(
      insights
        .flatMap((insight) => insight.recommendedActions)
        .filter((action) => action.priority >= 80)
        .sort((left, right) => right.priority - left.priority),
    ).slice(0, 5);
  }

  collectLongTermOpportunities(insights: DashboardInsight[]): DashboardRecommendedAction[] {
    return dedupeActions(
      insights
        .flatMap((insight) => insight.recommendedActions)
        .filter((action) => action.priority < 80)
        .sort((left, right) => right.priority - left.priority),
    ).slice(0, 5);
  }
}

function dedupeActions(actions: DashboardRecommendedAction[]): DashboardRecommendedAction[] {
  const seen = new Set<string>();
  const result: DashboardRecommendedAction[] = [];
  for (const action of actions) {
    if (seen.has(action.actionType)) continue;
    seen.add(action.actionType);
    result.push(action);
  }
  return result;
}

export const recommendationEngine = new RecommendationEngine();

export function resetRecommendationEngineCounter(): void {
  actionCounter = 0;
}
