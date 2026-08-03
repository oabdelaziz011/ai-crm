import { memo } from "react";

type TypingIndicatorProps = {
  label: string;
};

export const TypingIndicator = memo(function TypingIndicator({ label }: TypingIndicatorProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 px-3 py-2 text-[11px] text-[var(--ad-text-muted)]" aria-live="polite">
      <span dir="auto">{label}</span>
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1.5 rounded-full bg-[var(--ad-accent)] opacity-70"
            style={{ animation: `ws-typing-bounce 1.2s ease-in-out ${index * 0.15}s infinite` }}
          />
        ))}
      </span>
    </div>
  );
});
