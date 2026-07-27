import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { DashboardCard } from "@/components/dashboard/ui";
import type { MonthlyPoint } from "@/lib/dashboard/executive-metrics";
import type { ReactNode } from "react";

type ExecutiveTrendChartProps = {
  chartId: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  data: MonthlyPoint[];
  loading?: boolean;
  valueFormatter?: (value: number) => string;
  emptyLabel: string;
  color?: string;
};

const chartConfig = {
  value: {
    label: "Value",
    color: "hsl(var(--primary))",
  },
};

export function ExecutiveTrendChart({
  title,
  subtitle,
  icon,
  data,
  loading,
  valueFormatter = (v) => String(v),
  emptyLabel,
  color = "hsl(var(--primary))",
  chartId,
}: ExecutiveTrendChartProps) {
  const gradientId = `exec-fill-${chartId}`;
  const hasData = data.some((point) => point.value > 0);
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <DashboardCard className="flex h-full flex-col p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-end gap-2 pb-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 animate-pulse rounded-t-md bg-muted"
              style={{ height: `${30 + (i % 3) * 20}%` }}
            />
          ))}
        </div>
      ) : !hasData ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              className="text-[11px]"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={40}
              domain={[0, maxValue * 1.1]}
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              className="text-[11px]"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => valueFormatter(Number(value))}
                  labelFormatter={(label) => label}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </DashboardCard>
  );
}
