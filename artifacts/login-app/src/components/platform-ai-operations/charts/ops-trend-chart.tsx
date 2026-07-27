import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { DashboardCard } from "@/components/dashboard/ui";
import type { PlatformAiOpsCostTrendPoint } from "@/lib/platform-ai-operations";

type OpsTrendChartProps = {
  title: string;
  data: PlatformAiOpsCostTrendPoint[];
  dataKey: "total_tokens" | "estimated_cost" | "request_count";
  loading?: boolean;
  valueFormatter?: (value: number) => string;
};

const chartConfig = {
  value: { label: "Value", color: "hsl(var(--primary))" },
};

export function OpsTrendChart({
  title,
  data,
  dataKey,
  loading,
  valueFormatter = (v) => String(v),
}: OpsTrendChartProps) {
  const { t } = useTranslation("common");
  const chartData = data.map((point) => ({
    label: point.day.slice(5),
    value: Number(point[dataKey]),
  }));

  return (
    <DashboardCard className="p-5">
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      {loading ? (
        <div className="h-[220px] animate-pulse rounded-lg bg-muted/30" />
      ) : chartData.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t("platformAiOps.charts.empty")}</p>
      ) : (
        <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="opsTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} className="text-[11px]" />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} className="text-[11px]" width={48} />
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => valueFormatter(Number(v))} />} />
            <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="url(#opsTrendFill)" strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
      )}
    </DashboardCard>
  );
}
