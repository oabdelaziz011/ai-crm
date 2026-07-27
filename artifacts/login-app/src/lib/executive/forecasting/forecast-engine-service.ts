import type { ForecastHorizon, ForecastResult, ForecastType, RawExecutiveData } from "@/lib/executive/types";
import { computeTrend, linearForecast, movingAverage } from "@/lib/executive/selectors/executive-math";

/** Statistical forecasting — no AI, pure projections. */
export class ForecastEngineService {
  buildForecasts(data: RawExecutiveData, horizons: ForecastHorizon[] = [7, 30, 90]): ForecastResult[] {
    const results: ForecastResult[] = [];

    const revenueHistory = data.bookingsHistory.map((h) => h.revenueCents);
    const bookingHistory = data.bookingsHistory.map((h) => h.count);

    for (const horizon of horizons) {
      results.push(this.forecastSeries("revenue", horizon, revenueHistory, data.bookingsHistory));
      results.push(this.forecastSeries("bookings", horizon, bookingHistory, data.bookingsHistory));
      results.push(this.forecastOccupancy(horizon, bookingHistory));
      results.push(this.forecastCashFlow(horizon, revenueHistory, data.bookingsHistory));
    }

    return results;
  }

  private forecastSeries(
    forecastType: ForecastType,
    horizonDays: ForecastHorizon,
    history: number[],
    dateHistory: Array<{ date: string }>,
  ): ForecastResult {
    const projected = linearForecast(history, horizonDays);
    const growth = computeTrend(projected.at(-1) ?? 0, movingAverage(history));

    const startDate = new Date();
    const points = projected.map((value, i) => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i + 1);
      return { date: d.toISOString().slice(0, 10), value };
    });

    return {
      horizonDays,
      forecastType,
      points,
      growthTrendPercent: growth.changePercent,
      requiredCapacity: forecastType === "bookings" ? Math.ceil(movingAverage(projected) * 1.2) : null,
      peakHours: this.inferPeakHours(dateHistory.length),
    };
  }

  private forecastOccupancy(horizonDays: ForecastHorizon, bookingHistory: number[]): ForecastResult {
    const projected = linearForecast(bookingHistory, horizonDays);
    const maxBookings = Math.max(...bookingHistory, 1);
    const occupancyPoints = projected.map((count) => ({
      date: "",
      value: Math.min(100, Math.round((count / maxBookings) * 100)),
    }));

    return {
      horizonDays,
      forecastType: "occupancy",
      points: occupancyPoints,
      growthTrendPercent: computeTrend(projected.at(-1) ?? 0, movingAverage(bookingHistory)).changePercent,
      requiredCapacity: Math.ceil(movingAverage(projected) * 1.15),
      peakHours: [],
    };
  }

  private forecastCashFlow(
    horizonDays: ForecastHorizon,
    revenueHistory: number[],
    dateHistory: Array<{ date: string }>,
  ): ForecastResult {
    return this.forecastSeries("cash_flow", horizonDays, revenueHistory, dateHistory);
  }

  private inferPeakHours(historyLength: number): string[] {
    if (historyLength === 0) return [];
    return ["10:00", "14:00", "16:00"];
  }
}
