import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { DashboardCard } from "@/components/dashboard/ui";
import type { StatusSlice } from "@/lib/reports/reports-center-metrics";

function EmptyWidget({ message }: { message: string }) {
  return (
    <div className="flex h-[140px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function ReportsActivityChart({
  title,
  data,
  emptyLabel,
}: {
  title: string;
  data: Array<{ label: string; value: number }>;
  emptyLabel: string;
}) {
  const hasData = data.some((d) => d.value > 0);
  const config = useMemo(
    () => ({
      value: { label: title, color: "hsl(var(--primary))" },
    }),
    [title],
  );

  return (
    <DashboardCard className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
      {!hasData ? (
        <EmptyWidget message={emptyLabel} />
      ) : (
    <ChartContainer config={config} className="aspect-auto h-[180px] w-full">
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="reports-activity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} className="text-[11px]" />
            <YAxis tickLine={false} axisLine={false} width={36} className="text-[11px]" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#reports-activity-fill)"
              dot={false}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </DashboardCard>
  );
}

export function ReportsStatusBars({
  title,
  slices,
  emptyLabel,
}: {
  title: string;
  slices: StatusSlice[];
  emptyLabel: string;
}) {
  const { t } = useTranslation("common");
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <DashboardCard className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
      {total === 0 ? (
        <EmptyWidget message={emptyLabel} />
      ) : (
        <div className="space-y-3">
          {slices.map((slice) => {
            const pct = Math.round((slice.value / total) * 100);
            return (
              <div key={slice.key}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{t(slice.labelKey)}</span>
                  <span className="tabular-nums font-medium">
                    {slice.value} · {pct}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: slice.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}

export function ReportsDonutCard({
  title,
  slices,
  emptyLabel,
}: {
  title: string;
  slices: StatusSlice[];
  emptyLabel: string;
}) {
  const { t } = useTranslation("common");
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const data = slices.map((s) => ({ ...s, name: t(s.labelKey) }));
  const config = useMemo(() => {
    const entries: Record<string, { label: string; color: string }> = {};
    for (const s of slices) entries[s.key] = { label: t(s.labelKey), color: s.color };
    return entries;
  }, [slices, t]);

  return (
    <DashboardCard className="p-5">
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      {total === 0 ? (
        <EmptyWidget message={emptyLabel} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <ChartContainer config={config} className="mx-auto aspect-square h-[150px] w-full max-w-[160px]">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={40} outerRadius={62} strokeWidth={2}>
                {data.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <ul className="space-y-2 text-sm">
            {data.map((entry) => (
              <li key={entry.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  {entry.name}
                </span>
                <span className="tabular-nums font-medium">{entry.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardCard>
  );
}

export function ReportsBarCard({
  title,
  data,
  emptyLabel,
}: {
  title: string;
  data: Array<{ label: string; value: number }>;
  emptyLabel: string;
}) {
  const hasData = data.some((d) => d.value > 0);
  const config = useMemo(
    () => ({ value: { label: title, color: "hsl(var(--primary))" } }),
    [title],
  );

  return (
    <DashboardCard className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
      {!hasData ? (
        <EmptyWidget message={emptyLabel} />
      ) : (
        <ChartContainer config={config} className="aspect-auto h-[160px] w-full">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} className="text-[11px]" />
            <YAxis tickLine={false} axisLine={false} width={32} className="text-[11px]" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartContainer>
      )}
    </DashboardCard>
  );
}
