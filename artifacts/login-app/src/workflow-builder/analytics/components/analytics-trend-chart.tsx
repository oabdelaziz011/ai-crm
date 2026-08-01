import { memo } from "react";
import { AnalyticsMiniChart } from "@/components/executive-dashboard/analytics-mini-chart";
import type { ExecutiveChartPoint } from "@/lib/dashboard";

type AnalyticsTrendChartProps = {
  chartId: string;
  data: ExecutiveChartPoint[];
};

export const AnalyticsTrendChart = memo(function AnalyticsTrendChart({ chartId, data }: AnalyticsTrendChartProps) {
  return <AnalyticsMiniChart chartId={chartId} data={data} />;
});
