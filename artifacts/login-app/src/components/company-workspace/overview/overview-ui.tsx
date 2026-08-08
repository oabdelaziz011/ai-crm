import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AiQuotaTone } from "@/lib/company-workspace/executive-ai-usage";
import type { DailyUsagePoint } from "@/lib/company-workspace/executive-ai-usage";
import type { HealthCheckState } from "@/lib/company-workspace/executive-overview-health";

export function displayValue(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function OverviewSection({
  title,
  subtitle,
  children,
  className,
  empty,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  empty?: boolean;
  actions?: ReactNode;
}) {
  if (empty) return null;
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/60 bg-card p-4 shadow-sm md:p-5",
        className,
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function InfoField({
  label,
  value,
  className,
  href,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
  href?: string | null;
}) {
  const shown = displayValue(value);
  if (!shown) return null;
  return (
    <div className={cn("min-w-0 space-y-0.5", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="break-all text-sm font-medium text-primary hover:underline"
        >
          {shown}
        </a>
      ) : (
        <p className="break-words text-sm font-medium text-foreground">{shown}</p>
      )}
    </div>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: "success" | "warning" | "muted" | "danger" | "info" | "orange";
  children: ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : tone === "warning"
        ? "border-warning/30 bg-warning/10 text-warning"
        : tone === "orange"
          ? "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400"
          : tone === "danger"
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : tone === "info"
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border/60 bg-muted/40 text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        toneClass,
      )}
    >
      {children}
    </span>
  );
}

function toneStroke(tone: AiQuotaTone | "neutral" | HealthCheckState): string {
  if (tone === "over" || tone === "missing") return "text-destructive";
  if (tone === "high") return "text-red-500";
  if (tone === "warn" || tone === "warning") return "text-orange-500";
  if (tone === "mid") return "text-blue-500";
  if (tone === "ok" || tone === "healthy") return "text-success";
  return "text-primary";
}

function toneBar(tone: AiQuotaTone | "neutral"): string {
  if (tone === "over") return "bg-red-800 dark:bg-red-900";
  if (tone === "high") return "bg-red-500";
  if (tone === "warn") return "bg-orange-500";
  if (tone === "mid") return "bg-blue-500";
  if (tone === "ok") return "bg-success";
  return "bg-primary";
}

export function BrandProgressRing({
  value,
  size = 120,
  stroke = 10,
  tone = "ok",
  children,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: AiQuotaTone | "neutral" | HealthCheckState;
  children?: ReactNode;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/40"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            "transition-[stroke-dashoffset] duration-500 ease-out",
            toneStroke(tone),
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}

export function QuotaBar({
  label,
  usedLabel,
  pct,
  tone,
}: {
  label: string;
  usedLabel: string;
  pct: number;
  tone: AiQuotaTone | "neutral";
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">{usedLabel}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted/50">
        <div
          className={cn("h-full rounded-full transition-all duration-500", toneBar(tone))}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <p className="text-[11px] tabular-nums text-muted-foreground">
        {Math.round(pct)}%
      </p>
    </div>
  );
}

export function LicenseMeter({
  label,
  used,
  limit,
  formatValue,
}: {
  label: string;
  used: number;
  limit: number;
  formatValue?: (n: number) => string;
}) {
  const fmt = formatValue ?? ((n: number) => n.toLocaleString());
  const pctRaw = limit > 0 ? (used / limit) * 100 : 0;
  const tone: AiQuotaTone =
    pctRaw > 100
      ? "over"
      : pctRaw >= 95
        ? "high"
        : pctRaw >= 80
          ? "warn"
          : pctRaw >= 60
            ? "mid"
            : "ok";

  return (
    <QuotaBar
      label={label}
      usedLabel={`${fmt(used)} / ${fmt(limit)}`}
      pct={Math.min(100, pctRaw)}
      tone={tone}
    />
  );
}

export function DailyUsageBars({
  series,
  emptyLabel,
  tokensLabel,
}: {
  series: DailyUsagePoint[];
  emptyLabel: string;
  /** i18n label for tooltip token count, e.g. "Tokens" */
  tokensLabel?: string;
}) {
  if (!series.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/15">
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  const max = Math.max(...series.map((d) => d.tokens), 1);

  return (
    <div className="space-y-2">
      <div className="flex h-40 items-end gap-px sm:gap-0.5">
        {series.map((point) => {
          const height =
            point.tokens > 0 ? Math.max(4, Math.round((point.tokens / max) * 100)) : 2;
          return (
            <div
              key={point.dateKey}
              className="group relative flex min-w-0 flex-1 flex-col items-center justify-end"
            >
              <div
                className={cn(
                  "pointer-events-none absolute bottom-full z-10 mb-1.5 hidden w-max max-w-[10rem] rounded-md border border-border/60 bg-popover px-2 py-1.5 text-[10px] shadow-md group-hover:block",
                )}
              >
                <p className="font-medium text-foreground">{point.label}</p>
                <p className="tabular-nums text-muted-foreground">
                  {tokensLabel ? `${tokensLabel}: ` : null}
                  {point.tokens.toLocaleString()}
                </p>
              </div>
              <div
                className={cn(
                  "w-full rounded-t-sm transition-colors",
                  point.tokens > 0
                    ? "bg-success/80 group-hover:bg-success"
                    : "bg-muted/40",
                )}
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{series[0]?.label}</span>
        <span>{series[series.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export function ResourceTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/15 px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}
