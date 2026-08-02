import { memo } from "react";
import type { ComposerMentionTarget } from "@/lib/omnichannel/types/composer-enterprise-types";

type ComposerMentionListProps = {
  targets: ComposerMentionTarget[];
  highlightIndex: number;
  labels: {
    agents: string;
    teams: string;
    online: string;
  };
  onSelect: (target: ComposerMentionTarget) => void;
};

export const ComposerMentionList = memo(function ComposerMentionList({
  targets,
  highlightIndex,
  labels,
  onSelect,
}: ComposerMentionListProps) {
  if (targets.length === 0) return null;

  const agents = targets.filter((target) => target.type === "agent");
  const teams = targets.filter((target) => target.type === "team");

  return (
    <div
      className="absolute inset-x-2 bottom-full z-30 mb-1 max-h-52 overflow-y-auto rounded-lg border border-[var(--ad-border-subtle)] bg-[var(--ad-surface-raised)] py-1 shadow-lg"
      role="listbox"
      aria-label={labels.agents}
    >
      {agents.length > 0 ? (
        <p className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--ad-text-muted)]" dir="auto">
          {labels.agents}
        </p>
      ) : null}
      {agents.map((target, index) => (
        <MentionRow
          key={`agent-${target.id}`}
          target={target}
          selected={index === highlightIndex}
          onlineLabel={labels.online}
          onSelect={onSelect}
        />
      ))}
      {teams.length > 0 ? (
        <p className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--ad-text-muted)]" dir="auto">
          {labels.teams}
        </p>
      ) : null}
      {teams.map((target, index) => (
        <MentionRow
          key={`team-${target.id}`}
          target={target}
          selected={agents.length + index === highlightIndex}
          onlineLabel={labels.online}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
});

function MentionRow({
  target,
  selected,
  onlineLabel,
  onSelect,
}: {
  target: ComposerMentionTarget;
  selected: boolean;
  onlineLabel: string;
  onSelect: (target: ComposerMentionTarget) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-xs ${
        selected ? "bg-[var(--ad-accent-dim)]" : "hover:bg-[var(--ad-accent-dim)]/60"
      }`}
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect(target);
      }}
    >
      <span dir="auto">@{target.handle}</span>
      <span className="truncate text-[10px] text-[var(--ad-text-muted)]" dir="auto">
        {target.label}
        {target.online ? ` · ${onlineLabel}` : ""}
      </span>
    </button>
  );
}
