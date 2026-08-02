import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ProgressRing({
  value,
  size = 56,
  stroke = 4,
  className,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamp(value) / 100) * circumference;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-[var(--ws-surface)] opacity-80"
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
          className="text-current transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function ConfidenceBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-[var(--ws-surface)]", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-[var(--ws-accent)] to-violet-400 transition-[width] duration-500 ease-out"
        style={{ width: `${clamp(value)}%` }}
      />
    </div>
  );
}

export function MiniSparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - (value / max) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cn("h-8 w-full text-[var(--ws-accent)]", className)}>
      <polyline fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" points={points} />
    </svg>
  );
}

export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "healthy" | "warning" | "critical" | "resolved" | "closed" | "escalated";
}) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[9px] font-medium", statusToneClass(tone))}>
      {label}
    </span>
  );
}

export function statusToneClass(
  tone: "healthy" | "warning" | "critical" | "resolved" | "closed" | "escalated",
): string {
  switch (tone) {
    case "healthy":
      return "border-emerald-400/40 bg-emerald-500/10 text-emerald-300";
    case "warning":
      return "border-orange-400/40 bg-orange-500/10 text-orange-300";
    case "critical":
      return "border-red-400/40 bg-red-500/10 text-red-300";
    case "resolved":
      return "border-sky-400/40 bg-sky-500/10 text-sky-300";
    case "closed":
      return "border-[var(--ws-muted)]/40 bg-[var(--ws-surface)] text-[var(--ws-muted)]";
    case "escalated":
      return "border-violet-400/40 bg-violet-500/10 text-violet-300";
    default:
      return "border-[var(--ws-border-subtle)] bg-[var(--ws-surface)] text-[var(--ws-muted)]";
  }
}

export function scoreColorClass(score: number): string {
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-[var(--ws-accent)]";
  if (score >= 50) return "text-orange-400";
  return "text-red-400";
}

export function TimelineRail({
  isFirst,
  isLast,
  tone = "default",
}: {
  isFirst: boolean;
  isLast: boolean;
  tone?: "healthy" | "warning" | "critical" | "resolved" | "closed" | "escalated" | "default";
}) {
  const dotClass =
    tone === "healthy"
      ? "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.2)]"
      : tone === "warning"
        ? "bg-orange-400 shadow-[0_0_0_3px_rgba(251,146,60,0.2)]"
        : tone === "critical"
          ? "bg-red-400 shadow-[0_0_0_3px_rgba(248,113,113,0.2)]"
          : tone === "resolved"
            ? "bg-sky-400 shadow-[0_0_0_3px_rgba(56,189,248,0.2)]"
            : tone === "closed"
              ? "bg-[var(--ws-muted)]"
              : tone === "escalated"
                ? "bg-violet-400 shadow-[0_0_0_3px_rgba(167,139,250,0.2)]"
                : "bg-[var(--ws-accent)] shadow-[0_0_0_3px_rgba(45,212,191,0.15)]";

  return (
    <div className="flex w-5 shrink-0 flex-col items-center">
      {!isFirst ? <div className="h-2 w-px bg-[var(--ws-border-subtle)]" /> : <div className="h-1" />}
      <div className={cn("size-2.5 shrink-0 rounded-full transition-transform duration-200 hover:scale-125", dotClass)} />
      {!isLast ? <div className="min-h-6 w-px flex-1 bg-[var(--ws-border-subtle)]" /> : null}
    </div>
  );
}
