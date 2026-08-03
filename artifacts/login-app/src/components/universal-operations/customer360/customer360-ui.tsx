import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export function Customer360Section({
  id,
  title,
  children,
  collapsed,
  onToggle,
  className,
}: {
  id: string;
  title: string;
  children: ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
          </button>
        )}
      </div>
      {!collapsed && children}
    </section>
  );
}

export function Customer360Card({
  children,
  className,
  accent,
}: {
  children: ReactNode;
  className?: string;
  accent?: "primary" | "success" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-card/90 p-4 shadow-sm backdrop-blur-sm",
        accent === "primary" && "border-primary/25 bg-primary/5",
        accent === "success" && "border-emerald-500/25 bg-emerald-500/5",
        accent === "warning" && "border-amber-500/25 bg-amber-500/5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Customer360Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

export function Customer360Badge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "vip" | "success" | "warning" | "danger";
}) {
  const { t } = useTranslation("common");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        tone === "vip" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        tone === "success" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        tone === "warning" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        tone === "danger" && "bg-red-500/15 text-red-600 dark:text-red-400",
        tone === "default" && "bg-muted/60 text-muted-foreground",
      )}
    >
      {tone === "vip" ? t("customer360.badges.vip") : label}
    </span>
  );
}

export function fmtMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}
