import { memo } from "react";

export const MESSAGE_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

type MessageReactionsBarProps = {
  activeReaction: string | null;
  onSelect: (emoji: string) => void;
  onClear: () => void;
  disabled?: boolean;
};

export const MessageReactionsBar = memo(function MessageReactionsBar({
  activeReaction,
  onSelect,
  onClear,
  disabled,
}: MessageReactionsBarProps) {
  if (disabled) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
      {MESSAGE_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className={`rounded px-1 py-0.5 text-sm hover:bg-[var(--ad-accent-dim)] ${
            activeReaction === emoji ? "bg-[var(--ad-accent-dim)] ring-1 ring-[var(--ad-accent)]/40" : ""
          }`}
          onClick={() => (activeReaction === emoji ? onClear() : onSelect(emoji))}
          aria-label={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
});

export function ReactionBadge({ emoji }: { emoji: string }) {
  return (
    <span className="mt-1 inline-flex rounded-full bg-[var(--ad-surface-2)] px-1.5 py-0.5 text-xs shadow-sm">
      {emoji}
    </span>
  );
}
