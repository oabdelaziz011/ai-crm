import { memo } from "react";
import { cn } from "@/lib/utils";
import type { ConversationSlaPresentation } from "@/lib/omnichannel/presentation/conversation-sla-presentation";

type SlaBadgeProps = {
  presentation: ConversationSlaPresentation;
  className?: string;
  size?: "sm" | "md";
  /** Compact list card: hide unavailable to reduce noise */
  hideWhenUnavailable?: boolean;
};

const TONE: Record<ConversationSlaPresentation["tone"], string> = {
  neutral: "border-[var(--ws-border)] bg-[var(--ws-surface-2)] text-[var(--ws-muted)]",
  ok: "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  warn: "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300",
  danger: "border-destructive/40 bg-destructive/12 text-destructive",
};

export const SlaBadge = memo(function SlaBadge({
  presentation,
  className,
  size = "sm",
  hideWhenUnavailable = false,
}: SlaBadgeProps) {
  if (hideWhenUnavailable && presentation.state === "unavailable") return null;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-full border font-semibold tabular-nums",
        size === "md" ? "px-2.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[10px]",
        TONE[presentation.tone],
        className,
      )}
      title={presentation.detailLabel}
      data-sla-state={presentation.state}
    >
      <span className="truncate" dir="auto">
        {presentation.shortLabel}
      </span>
    </span>
  );
});
