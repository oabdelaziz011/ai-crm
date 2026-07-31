import type { DashboardMetricTrend } from "../types.js";
import type { DashboardTrendStrength } from "./analytics-types.js";
import { growthCalculator } from "./growth-calculator.js";

export class TrendCalculator {
  direction(currentValue: number, previousValue: number): DashboardMetricTrend {
    const difference = growthCalculator.absoluteDifference(currentValue, previousValue);
    if (difference === 0) return "flat";
    return difference > 0 ? "up" : "down";
  }

  strength(percentageDifference: number | null): DashboardTrendStrength {
    if (percentageDifference == null || percentageDifference === 0) return "none";
    const magnitude = Math.abs(percentageDifference);
    if (magnitude >= 20) return "strong";
    if (magnitude >= 5) return "moderate";
    return "weak";
  }

  summarize(currentValue: number, previousValue: number) {
    const absoluteDifference = growthCalculator.absoluteDifference(currentValue, previousValue);
    const percentageDifference = growthCalculator.percentageDifference(currentValue, previousValue);
    return {
      absoluteDifference,
      percentageDifference,
      trendDirection: this.direction(currentValue, previousValue),
      trendStrength: this.strength(percentageDifference),
    };
  }
}

export const trendCalculator = new TrendCalculator();
