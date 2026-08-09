import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const opportunityCreateInputClass =
  "h-10 rounded-lg border-border/70 bg-background text-[13px] shadow-none focus-visible:ring-1 focus-visible:ring-ring/40";

export function OpportunityCreateFieldShell({
  label,
  htmlFor,
  required,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground/90">
        {label}
        {required ? <span className="ms-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
    </div>
  );
}

export function OpportunityCreateSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function OpportunityCreateReadOnlyValue({
  label,
  value,
  emptyLabel,
}: {
  label: string;
  value: string;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className="text-[13px] text-foreground">{value.trim() || emptyLabel}</p>
    </div>
  );
}
