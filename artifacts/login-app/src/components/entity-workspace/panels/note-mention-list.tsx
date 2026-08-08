import { memo } from "react";
import type { NoteMentionTarget } from "@/lib/entity-workspace/services/note-mentions";
import { cn } from "@/lib/utils";

type Props = {
  targets: NoteMentionTarget[];
  highlightIndex: number;
  emptyLabel: string;
  onSelect: (target: NoteMentionTarget) => void;
};

export const NoteMentionList = memo(function NoteMentionList({
  targets,
  highlightIndex,
  emptyLabel,
  onSelect,
}: Props) {
  if (targets.length === 0) {
    return (
      <div className="absolute inset-x-0 bottom-full z-20 mb-1 rounded-xl border border-border/60 bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      className="absolute inset-x-0 bottom-full z-20 mb-1 max-h-52 overflow-y-auto rounded-xl border border-border/60 bg-card py-1 shadow-md"
      role="listbox"
    >
      {targets.map((target, index) => (
        <button
          key={`${target.type}-${target.id}`}
          type="button"
          role="option"
          aria-selected={index === highlightIndex}
          className={cn(
            "flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-xs",
            index === highlightIndex ? "bg-primary/12 text-primary" : "hover:bg-muted/50",
          )}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(target);
          }}
        >
          <span className="font-semibold">@{target.handle}</span>
          <span className="truncate text-muted-foreground">{target.label}</span>
        </button>
      ))}
    </div>
  );
});
