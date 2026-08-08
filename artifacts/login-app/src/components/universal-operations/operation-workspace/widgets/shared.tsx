import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WidgetCard({
  title,
  children,
  className,
  action,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border border-border/60 bg-card/80", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {action}
      </div>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  );
}

export function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="max-w-[65%] text-end font-medium">{value}</span>
    </div>
  );
}

export function ComingSoonBanner({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
      {label}
    </div>
  );
}
