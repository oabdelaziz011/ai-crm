import { memo } from "react";
import {
  OMNICHANNEL_PRIMARY_CHANNELS,
  type OmnichannelListFilters,
} from "@/lib/omnichannel/types/unified-conversation";

type FilterPopoverProps = {
  open: boolean;
  onClose: () => void;
  filters: OmnichannelListFilters;
  onChange: (patch: Partial<OmnichannelListFilters>) => void;
  currentUserId?: string | null;
  tagOptions: Array<{ id: string; label: string; count: number }>;
  labels: Record<string, string>;
  closeLabel: string;
  channelSectionLabel: string;
  tagSectionLabel: string;
};

export const FilterPopover = memo(function FilterPopover({
  open,
  onClose,
  filters,
  onChange,
  currentUserId,
  tagOptions,
  labels,
  closeLabel,
  channelSectionLabel,
  tagSectionLabel,
}: FilterPopoverProps) {
  if (!open) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-50 bg-foreground/30" aria-label={closeLabel} onClick={onClose} />
      <div className="fixed start-1/2 top-20 z-50 w-[min(100vw-2rem,22rem)] -translate-x-1/2 rounded-xl border border-[var(--ad-border)] bg-[var(--ad-surface-raised)] p-4 shadow-2xl lg:start-auto lg:end-4 lg:translate-x-0">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--ad-text-muted)]">{labels.filters}</p>
        <div className="space-y-2 text-xs">
          <Toggle label={labels.unread} checked={Boolean(filters.unreadOnly)} onChange={(v) => onChange({ unreadOnly: v || undefined })} />
          <Toggle label={labels.mine} checked={filters.assignedUserId === currentUserId} onChange={(v) => onChange({ assignedUserId: v ? currentUserId ?? undefined : undefined })} />
          <Toggle label={labels.assigned} checked={Boolean(filters.assignedOnly)} onChange={(v) => onChange({ assignedOnly: v || undefined })} />
          <Toggle label={labels.ai} checked={filters.handlerMode === "ai"} onChange={(v) => onChange({ handlerMode: v ? "ai" : undefined })} />
          <Toggle label={labels.pinned} checked={Boolean(filters.pinnedOnly)} onChange={(v) => onChange({ pinnedOnly: v || undefined })} />
          <Toggle label={labels.archived} checked={Boolean(filters.archived)} onChange={(v) => onChange({ archived: v || undefined })} />
        </div>
        <p className="mb-2 mt-4 text-[10px] uppercase text-[var(--ad-text-muted)]">{channelSectionLabel}</p>
        <select
          className="agent-desk-input text-xs"
          value={filters.channel ?? ""}
          onChange={(e) => onChange({ channel: (e.target.value || undefined) as OmnichannelListFilters["channel"] })}
        >
          <option value="">{labels.all}</option>
          {OMNICHANNEL_PRIMARY_CHANNELS.map((ch) => (
            <option key={ch} value={ch}>{labels[ch] ?? ch}</option>
          ))}
        </select>
        {tagOptions.length > 0 ? (
          <>
            <p className="mb-2 mt-4 text-[10px] uppercase text-[var(--ad-text-muted)]">{tagSectionLabel}</p>
            <select className="agent-desk-input text-xs" value={filters.tag ?? ""} onChange={(e) => onChange({ tag: e.target.value || undefined })}>
              <option value="">{labels.all}</option>
              {tagOptions.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.label} ({tag.count})</option>
              ))}
            </select>
          </>
        ) : null}
      </div>
    </>
  );
});

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--ad-accent-dim)]">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-primary" />
    </label>
  );
}
