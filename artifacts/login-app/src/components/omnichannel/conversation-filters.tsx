import { memo } from "react";
import { Search } from "lucide-react";
import { OMNICHANNEL_PRIMARY_CHANNELS } from "@/lib/omnichannel/types/unified-conversation";
import type { OmnichannelListFilters } from "@/lib/omnichannel/types/unified-conversation";

type ConversationSearchProps = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

export const ConversationSearch = memo(function ConversationSearch({
  value,
  placeholder,
  onChange,
}: ConversationSearchProps) {
  return (
    <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-white/5 bg-black/30 px-3 py-1.5">
      <Search className="size-3.5 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  );
});

type ConversationFiltersProps = {
  filters: OmnichannelListFilters;
  labels: {
    all: string;
    unread: string;
    mine: string;
    pinned: string;
    archived: string;
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
      <FilterChip active={!filters.unreadOnly && !filters.pinnedOnly && !filters.archived} label={labels.all} onClick={() => onChange({ unreadOnly: false, pinnedOnly: false, archived: false, assignedUserId: undefined })} />
      <FilterChip active={Boolean(filters.unreadOnly)} label={labels.unread} onClick={() => onChange({ unreadOnly: true, pinnedOnly: false, archived: false })} />
      <FilterChip active={filters.assignedUserId === currentUserId} label={labels.mine} onClick={() => onChange({ assignedUserId: currentUserId ?? undefined, unreadOnly: false })} />
      <FilterChip active={Boolean(filters.pinnedOnly)} label={labels.pinned} onClick={() => onChange({ pinnedOnly: true, archived: false })} />
      <FilterChip active={Boolean(filters.archived)} label={labels.archived} onClick={() => onChange({ archived: true, pinnedOnly: false })} />
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
