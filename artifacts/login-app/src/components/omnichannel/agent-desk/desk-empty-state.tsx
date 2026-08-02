import { memo } from "react";
import { Inbox, MessageSquare, Users } from "lucide-react";

type DeskEmptyStateProps = {
  variant: "session" | "queue" | "transcript" | "insight";
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

const ICONS = {
  session: Inbox,
  queue: Users,
  transcript: MessageSquare,
  insight: Users,
};

export const DeskEmptyState = memo(function DeskEmptyState({
  variant,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: DeskEmptyStateProps) {
  const Icon = ICONS[variant];

  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="agent-desk-empty-art mb-4 flex items-center justify-center">
        <Icon className="size-6 text-[var(--ad-accent)] opacity-70" aria-hidden />
      </div>
      <p className="text-sm font-medium text-[var(--ad-text)]">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-[var(--ad-text-muted)]">{description}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {actionLabel && onAction ? (
          <button type="button" className="agent-desk-btn agent-desk-btn--primary" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
        {secondaryActionLabel && onSecondaryAction ? (
          <button type="button" className="agent-desk-btn" onClick={onSecondaryAction}>
            {secondaryActionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
});
