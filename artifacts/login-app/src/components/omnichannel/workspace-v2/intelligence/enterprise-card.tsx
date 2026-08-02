import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EnterpriseCardProps = {
  children: ReactNode;
  className?: string;
  accent?: "default" | "violet" | "accent" | "warn";
  hover?: boolean;
};

const accentBorder: Record<NonNullable<EnterpriseCardProps["accent"]>, string> = {
  default: "border-[var(--ws-border-subtle)]",
  violet: "border-violet-500/20 bg-gradient-to-b from-violet-950/25 to-[var(--ws-surface-2)]",
  accent: "border-[var(--ws-accent)]/20 bg-gradient-to-b from-teal-950/20 to-[var(--ws-surface-2)]",
  warn: "border-[var(--ws-warn)]/20 bg-gradient-to-b from-amber-950/15 to-[var(--ws-surface-2)]",
};

export function EnterpriseCard({
  children,
  className,
  accent = "default",
  hover = false,
}: EnterpriseCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-[var(--ws-surface-2)] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        accentBorder[accent],
        hover && "transition-colors hover:border-[var(--ws-accent)]/30",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EnterpriseCardTitle({
  children,
  icon,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--ws-text)]",
        className,
      )}
    >
      {icon}
      {children}
    </h3>
  );
}

export function EnterpriseMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-[10px]">
      <span className="text-[var(--ws-muted)]" dir="auto">
        {label}
      </span>
      <span className="font-medium tabular-nums text-[var(--ws-text)]" dir="auto">
        {value}
      </span>
    </div>
  );
}
