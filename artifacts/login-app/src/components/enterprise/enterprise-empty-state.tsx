import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export type EnterpriseEmptyStateProps = {
  title: string;
  description: string;
  icon?: ReactNode;
  primaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
  compact?: boolean;
};

/**
 * Canonical empty state for ValueOR enterprise surfaces.
 * Prefer this over one-line "No data" text.
 */
export function EnterpriseEmptyState({
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  className,
  compact = false,
}: EnterpriseEmptyStateProps) {
  return (
    <Empty
      className={cn(
        "border border-dashed border-border/70 bg-muted/10",
        compact ? "min-h-[180px] gap-4 p-6 md:p-8" : "min-h-[240px]",
        className,
      )}
      role="status"
    >
      <EmptyHeader>
        <EmptyMedia variant="icon" className="rounded-xl">
          {icon ?? <Inbox className="size-6" aria-hidden />}
        </EmptyMedia>
        <EmptyTitle className="text-[1.05rem]">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {(primaryAction || secondaryAction) && (
        <EmptyContent>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {primaryAction ? (
              <Button
                type="button"
                className="h-9"
                disabled={primaryAction.disabled}
                onClick={primaryAction.onClick}
              >
                {primaryAction.label}
              </Button>
            ) : null}
            {secondaryAction ? (
              secondaryAction.href ? (
                <Button type="button" variant="ghost" className="h-9" asChild>
                  <a href={secondaryAction.href} target="_blank" rel="noreferrer">
                    {secondaryAction.label}
                  </a>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9"
                  onClick={secondaryAction.onClick}
                >
                  {secondaryAction.label}
                </Button>
              )
            ) : null}
          </div>
        </EmptyContent>
      )}
    </Empty>
  );
}
