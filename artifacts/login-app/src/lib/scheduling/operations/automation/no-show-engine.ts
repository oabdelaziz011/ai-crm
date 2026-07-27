import type { OperationsBookingView } from "@/lib/scheduling/operations/types";
import type {
  NoShowEvaluationResult,
  NoShowRuleConfig,
} from "@/lib/scheduling/operations/automation/no-show-types";

/** Pure evaluation — identifies confirmed bookings past grace period without check-in. */
export class NoShowEngine {
  static evaluate(
    bookings: OperationsBookingView[],
    rulesByBranch: Map<string | null, NoShowRuleConfig>,
    companyDefaultRule: NoShowRuleConfig | null,
    referenceNow: Date = new Date(),
  ): NoShowEvaluationResult[] {
    const results: NoShowEvaluationResult[] = [];
    const nowMs = referenceNow.getTime();

    for (const booking of bookings) {
      if (booking.status !== "confirmed") continue;

      const rule =
        (booking.branchId ? rulesByBranch.get(booking.branchId) : null) ??
        rulesByBranch.get(null) ??
        companyDefaultRule;

      if (!rule || !rule.enabled) continue;

      const startMs = new Date(booking.startAt).getTime();
      const minutesPastStart = Math.floor((nowMs - startMs) / 60_000);

      if (minutesPastStart >= rule.gracePeriodMinutes) {
        results.push({
          bookingId: booking.id,
          branchId: booking.branchId,
          gracePeriodMinutes: rule.gracePeriodMinutes,
          minutesPastStart,
        });
      }
    }

    return results;
  }

  static buildRulesMap(rules: NoShowRuleConfig[]): Map<string | null, NoShowRuleConfig> {
    const map = new Map<string | null, NoShowRuleConfig>();
    for (const rule of rules) {
      map.set(rule.branchId, rule);
    }
    return map;
  }
}
