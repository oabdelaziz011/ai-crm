import type { IntelligenceRecommendation } from "../types/intelligence-types.js";
import type { OperationsCustomer360WorkspaceData } from "../types/customer360-panel-types.js";

export class RecommendationEngine {
  generate(ctx: OperationsCustomer360WorkspaceData): IntelligenceRecommendation[] {
    const recs: IntelligenceRecommendation[] = [];

    if (ctx.outstandingBalanceCents > 0) {
      recs.push({
        id: "rec_collect",
        title: "Collect Remaining Payment",
        reason: `$${(ctx.outstandingBalanceCents / 100).toFixed(2)} outstanding before checkout.`,
        confidence: 0.94,
        actionKey: "collect_payment",
        labelKey: "rec.collectPayment",
      });
    }

    if (ctx.bookings.some((b) => b.status === "Confirmed" && new Date(b.scheduledAt) > new Date())) {
      recs.push({
        id: "rec_followup",
        title: "Book Follow-up",
        reason: "Patient due for follow-up based on last completed visit pattern.",
        confidence: 0.87,
        actionKey: "book_followup",
        labelKey: "rec.bookFollowup",
      });
    }

    if (ctx.summary.isVip) {
      recs.push({
        id: "rec_upgrade",
        title: "Upgrade Service",
        reason: "VIP customer — premium service package has 72% acceptance rate.",
        confidence: 0.78,
        actionKey: "upgrade_service",
        labelKey: "rec.upgradeService",
      });
    }

    if (ctx.todaysOperation.countdownMinutes > 20) {
      recs.push({
        id: "rec_reassign",
        title: "Assign Different Employee",
        reason: "Wait time exceeds target — alternate resource available in Room 2.",
        confidence: 0.81,
        actionKey: "reassign",
        labelKey: "rec.reassign",
      });
    }

    recs.push({
      id: "rec_whatsapp",
      title: "Send WhatsApp",
      reason: "Customer prefers WhatsApp — last 3 interactions were via messaging.",
      confidence: 0.89,
      actionKey: "send_whatsapp",
      labelKey: "rec.sendWhatsapp",
    });

    recs.push({
      id: "rec_task",
      title: "Create Task",
      reason: "Lab results pending — create follow-up task for nursing team.",
      confidence: 0.76,
      actionKey: "create_task",
      labelKey: "rec.createTask",
    });

    if (ctx.summary.riskLevel === "medium" || ctx.summary.riskLevel === "high") {
      recs.push({
        id: "rec_escalate",
        title: "Escalate to Manager",
        reason: "Elevated churn risk detected from engagement patterns.",
        confidence: 0.73,
        actionKey: "escalate",
        labelKey: "rec.escalate",
      });
    }

    return recs.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }
}

export const recommendationEngine = new RecommendationEngine();
