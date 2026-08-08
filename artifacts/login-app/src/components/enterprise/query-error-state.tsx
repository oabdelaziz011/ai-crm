import { useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type QueryErrorStateProps = {
  title: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  correlationId?: string | null;
  technicalDetails?: string | null;
  className?: string;
  icon?: ReactNode;
};

/**
 * Structured error surface for enterprise operators.
 * Prefer this over toast-only failures for page/section load errors.
 */
export function QueryErrorState({
  title,
  description,
  onRetry,
  retryLabel = "Retry",
  correlationId,
  technicalDetails,
  className,
  icon,
}: QueryErrorStateProps) {
  const [open, setOpen] = useState(false);
  const details = technicalDetails?.trim() || null;

  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-5 sm:px-6",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          {icon ?? <AlertTriangle className="size-4" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {onRetry ? (
              <Button type="button" size="sm" className="h-8 gap-1.5" onClick={onRetry}>
                <RefreshCcw className="size-3.5" aria-hidden />
                {retryLabel}
              </Button>
            ) : null}
            {details || correlationId ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
              >
                Technical details
                <ChevronDown
                  className={cn("size-3.5 transition-transform", open && "rotate-180")}
                  aria-hidden
                />
              </Button>
            ) : null}
          </div>

          {open ? (
            <div className="mt-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2.5 text-[12px] text-muted-foreground">
              {correlationId ? (
                <p className="font-mono">
                  Correlation ID: <span className="text-foreground">{correlationId}</span>
                </p>
              ) : null}
              {details ? (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
                  {details}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
