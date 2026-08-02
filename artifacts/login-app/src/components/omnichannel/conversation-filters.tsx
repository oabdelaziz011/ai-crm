import { forwardRef, memo } from "react";
import { Search } from "lucide-react";
import { OMNICHANNEL_PRIMARY_CHANNELS } from "@/lib/omnichannel/types/unified-conversation";
import type { OmnichannelListFilters } from "@/lib/omnichannel/types/unified-conversation";

type ConversationSearchProps = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

export const ConversationSearch = memo(
  forwardRef<HTMLInputElement, ConversationSearchProps>(function ConversationSearch(
    { value, placeholder, onChange },
    ref,
  ) {
    return (
      <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20">
        <Search className="size-3.5 text-muted-foreground" />
        <input
          ref={ref}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>
    );
  }),
);

type ConversationFiltersProps = {
  filters: OmnichannelListFilters;
  labels: {
    all: string;
    unread: string;
    mine: string;
    assigned: string;
    ai: string;
    pinned: string;
    archived: string;
    tags: string;
    whatsapp: string;
    email: string;
    messenger: string;
    instagram: string;
  };
  onChange: (patch: Partial<OmnichannelListFilters>) => void;
  currentUserId?: string | null;
};

export const ConversationFilters = memo(function ConversationFilters({
  filters,
  labels,
  onChange,
  currentUserId,
}: ConversationFiltersProps) {
  const chip = (active: boolean) =>
    active
      ? "border-primary/30 bg-primary/15 text-primary"
      : "border-white/10 text-muted-foreground hover:text-foreground";

  return (
    <div className="flex flex-wrap gap-2">
      <FilterChip active={!filters.unreadOnly && !filters.pinnedOnly && !filters.archived && !filters.assignedOnly && filters.handlerMode !== "ai"} label={labels.all} onClick={() => onChange({ unreadOnly: false, pinnedOnly: false, archived: false, assignedOnly: false, assignedUserId: undefined, handlerMode: undefined })} />
      <FilterChip active={Boolean(filters.unreadOnly)} label={labels.unread} onClick={() => onChange({ unreadOnly: true, pinnedOnly: false, archived: false, assignedOnly: false, handlerMode: undefined })} />
      <FilterChip active={filters.assignedUserId === currentUserId} label={labels.mine} onClick={() => onChange({ assignedUserId: currentUserId ?? undefined, unreadOnly: false, assignedOnly: false })} />
      <FilterChip active={Boolean(filters.assignedOnly)} label={labels.assigned} onClick={() => onChange({ assignedOnly: true, unreadOnly: false, assignedUserId: undefined, handlerMode: undefined })} />
      <FilterChip active={filters.handlerMode === "ai"} label={labels.ai} onClick={() => onChange({ handlerMode: filters.handlerMode === "ai" ? undefined : "ai", unreadOnly: false, assignedOnly: false })} />
      <FilterChip active={Boolean(filters.pinnedOnly)} label={labels.pinned} onClick={() => onChange({ pinnedOnly: true, archived: false, assignedOnly: false })} />
      <FilterChip active={Boolean(filters.archived)} label={labels.archived} onClick={() => onChange({ archived: true, pinnedOnly: false, assignedOnly: false })} />
      <FilterChip active={false} label={labels.tags} onClick={() => onChange({ pinnedOnly: filters.pinnedOnly })} />
      {OMNICHANNEL_PRIMARY_CHANNELS.map((channel) => (
        <FilterChip
          key={channel}
          active={filters.channel === channel}
          label={labels[channel as keyof typeof labels] ?? channel}
          onClick={() => onChange({ channel: filters.channel === channel ? undefined : channel })}
        />
      ))}
    </div>
  );
});

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
        active ? "border-primary/30 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
