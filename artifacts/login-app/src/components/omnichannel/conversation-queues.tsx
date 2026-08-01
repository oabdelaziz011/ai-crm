import { memo } from "react";
import {
  AlertTriangle,
  Archive,
  Bot,
  Inbox,
  User,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  OMNICHANNEL_QUEUE_IDS,
  type OmnichannelQueueId,
} from "@/lib/omnichannel/services/conversation-queues";
import { OmnichannelPanel, OmnichannelPanelHeader } from "@/components/omnichannel/omnichannel-panel";

const QUEUE_ICONS: Record<OmnichannelQueueId, typeof Inbox> = {
  unassigned: Inbox,
  mine: User,
  team: Users,
  waiting_customer: Archive,
  waiting_ai: Bot,
  escalated: AlertTriangle,
  closed_24h: Archive,
};

type ConversationQueuesProps = {
  title: string;
  activeQueue?: OmnichannelQueueId;
  counts: Record<OmnichannelQueueId, number>;
  labels: Record<OmnichannelQueueId, string> & { all: string };
  onChange: (queue: OmnichannelQueueId | undefined) => void;
  tagsTitle?: string;
  tagLabels?: Array<{ id: string; label: string; count: number }>;
  activeTag?: string;
  onTagChange?: (tagId: string | undefined) => void;
};

export const ConversationQueues = memo(function ConversationQueues({
  title,
  activeQueue,
  counts,
  labels,
  onChange,
  tagsTitle,
  tagLabels = [],
  activeTag,
  onTagChange,
}: ConversationQueuesProps) {
  return (
    <OmnichannelPanel className="h-full">
      <OmnichannelPanelHeader title={title} />
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3" role="tablist" aria-label="Conversation queues">
        <QueueButton
          active={!activeQueue}
          label={labels.all}
          onClick={() => onChange(undefined)}
        />
        {OMNICHANNEL_QUEUE_IDS.map((queueId) => {
          const Icon = QUEUE_ICONS[queueId];
          return (
            <QueueButton
              key={queueId}
              active={activeQueue === queueId}
              label={labels[queueId]}
              count={counts[queueId]}
              icon={Icon}
              onClick={() => onChange(activeQueue === queueId ? undefined : queueId)}
            />
          );
        })}
      </nav>

      {tagLabels.length > 0 && onTagChange ? (
        <div className="shrink-0 border-t border-white/[0.06] px-2 py-3">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {tagsTitle}
          </p>
          <div className="space-y-0.5">
            {tagLabels.map((tag) => (
              <QueueButton
                key={tag.id}
                active={activeTag === tag.id}
                label={tag.label}
                count={tag.count}
                onClick={() => onTagChange(activeTag === tag.id ? undefined : tag.id)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </OmnichannelPanel>
  );
});

function QueueButton({
  active,
  label,
  count,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  icon?: typeof Inbox;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-xs transition-all duration-150",
        active
          ? "bg-primary/12 text-primary shadow-sm ring-1 ring-primary/20"
          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
      )}
    >
      {Icon ? <Icon className="size-3.5 shrink-0 opacity-80" /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" ? (
        <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {count}
        </span>
      ) : null}
    </button>
  );
}
