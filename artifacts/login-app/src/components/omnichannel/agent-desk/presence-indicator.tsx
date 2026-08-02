import { memo } from "react";

export type PresenceState = "online" | "offline" | "away" | "busy" | "typing";

type PresenceIndicatorProps = {
  state: PresenceState;
  label: string;
  lastSeenLabel?: string;
  compact?: boolean;
};

const STATE_CLASS: Record<PresenceState, string> = {
  online: "bg-[var(--ws-success)]",
  offline: "bg-[var(--ws-muted)]",
  away: "bg-[var(--ws-warn)]",
  busy: "bg-[var(--ws-danger)]",
  typing: "bg-[var(--ws-accent)] animate-pulse",
};

export const PresenceIndicator = memo(function PresenceIndicator({
  state,
  label,
  lastSeenLabel,
  compact = false,
}: PresenceIndicatorProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${compact ? "text-[10px]" : "text-xs"} text-[var(--ws-muted)]`}>
      <span className={`size-2 shrink-0 rounded-full ring-2 ring-[var(--ws-surface)] ${STATE_CLASS[state]}`} aria-hidden />
      <span dir="auto">{label}</span>
      {!compact && lastSeenLabel ? (
        <span className="text-[10px] opacity-80" dir="auto">{lastSeenLabel}</span>
      ) : null}
    </span>
  );
});

export function resolveCustomerPresence(input: {
  lastActivityAt: string | null;
  isTyping?: boolean;
}): PresenceState {
  if (input.isTyping) return "typing";
  if (!input.lastActivityAt) return "offline";
  const minutes = (Date.now() - new Date(input.lastActivityAt).getTime()) / 60_000;
  if (minutes < 5) return "online";
  if (minutes < 30) return "away";
  return "offline";
}
