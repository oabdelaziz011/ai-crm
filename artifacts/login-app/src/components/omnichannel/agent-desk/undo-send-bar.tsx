import { memo } from "react";

type UndoSendBarProps = {
  secondsLeft: number;
  label: string;
  undoLabel: string;
  onUndo: () => void;
};

export const UndoSendBar = memo(function UndoSendBar({
  secondsLeft,
  label,
  undoLabel,
  onUndo,
}: UndoSendBarProps) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-[var(--ad-border-subtle)]/50 bg-[var(--ad-surface-2)] px-3 py-1.5 text-[11px]">
      <span dir="auto">{label.replace("{seconds}", String(secondsLeft))}</span>
      <button type="button" className="font-semibold text-[var(--ad-accent)] hover:underline" onClick={onUndo}>
        {undoLabel}
      </button>
    </div>
  );
});
