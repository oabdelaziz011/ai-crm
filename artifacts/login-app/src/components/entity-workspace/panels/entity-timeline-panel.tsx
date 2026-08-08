import { memo, useMemo } from "react";
import {
  Banknote,
  CalendarCheck2,
  Clock3,
  FileUp,
  MessageSquare,
  StickyNote,
  Workflow,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { useEntityWorkspace } from "@/context/entity-workspace-context";
import { EmployeeIdentityCard } from "@/components/employee-identity/employee-identity-card";
import { EntityVirtualList } from "@/components/entity-workspace/entity-virtual-list";
import type { EntityTimelineEvent, EntityTimelineEventType } from "@/lib/entity-workspace";
import { cn } from "@/lib/utils";

type Props = {
  searchQuery?: string;
  dense?: boolean;
  sticky?: boolean;
  className?: string;
  titleKey?: string;
  onOpenNote?: (noteId: string) => void;
};

const ICONS: Partial<Record<EntityTimelineEventType, typeof Clock3>> = {
  note_added: StickyNote,
  attachment_uploaded: FileUp,
  booking_created: CalendarCheck2,
  booking_completed: CalendarCheck2,
  payment_collected: Banknote,
  communication_sent: MessageSquare,
  status_changed: Workflow,
  operation_created: Workflow,
  operation_updated: Workflow,
};

export const EntityTimelinePanel = memo(function EntityTimelinePanel({
  searchQuery = "",
  dense,
  sticky,
  className,
  titleKey = "entityWorkspace.panels.timeline",
  onOpenNote,
}: Props) {
  const { t } = useTranslation("common");
  const { timeline } = useEntityWorkspace();

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return timeline;
    return timeline.filter((event) =>
      `${event.title} ${event.description ?? ""} ${event.actor ?? ""}`.toLowerCase().includes(q),
    );
  }, [searchQuery, timeline]);

  const groups = useMemo(
    () =>
      groupByDate(filtered, {
        today: t("entityWorkspace.timeline.today", { defaultValue: "Today" }),
        yesterday: t("entityWorkspace.timeline.yesterday", { defaultValue: "Yesterday" }),
      }),
    [filtered, t],
  );

  const flat = useMemo(
    () =>
      groups.flatMap((group) => [
        { kind: "header" as const, id: `h-${group.key}`, label: group.label },
        ...group.events.map((event) => ({ kind: "event" as const, id: event.id, event })),
      ]),
    [groups],
  );

  return (
    <section
      className={cn(
        "rounded-2xl border border-border/60 bg-card shadow-sm",
        dense ? "p-4" : "p-5",
        sticky && "lg:sticky lg:top-3 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto",
        className,
      )}
    >
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{t(titleKey)}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("entityWorkspace.timeline.sharedHint")}</p>
      </div>

      <div className="mt-4">
        {flat.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-center">
            <Clock3 className="size-6 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium">{t("entityWorkspace.timeline.emptyTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("entityWorkspace.timeline.emptyDescription")}</p>
          </div>
        ) : (
          <EntityVirtualList
            items={flat}
            rowHeight={96}
            maxHeightClassName={sticky ? "max-h-[calc(100dvh-12rem)]" : "max-h-[32rem]"}
            getKey={(item) => item.id}
            renderItem={(item) => {
              if (item.kind === "header") {
                return (
                  <p className="mb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </p>
                );
              }
              return (
                <TimelineCard
                  event={item.event}
                  onOpenNote={
                    item.event.noteId && onOpenNote
                      ? () => onOpenNote(item.event.noteId!)
                      : undefined
                  }
                />
              );
            }}
          />
        )}
      </div>
    </section>
  );
});

function TimelineCard({
  event,
  onOpenNote,
}: {
  event: EntityTimelineEvent;
  onOpenNote?: () => void;
}) {
  const { t } = useTranslation("common");
  const Icon = ICONS[event.eventType] ?? Clock3;
  const hasChange = Boolean(event.oldValue || event.newValue);
  const body = (
      <div className="flex gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-primary">
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{event.title}</p>
          {event.actorId || event.actor ? (
            <div className="mt-1.5">
              <EmployeeIdentityCard
                userId={event.actorId}
                fallbackName={event.actor}
                showEmail={false}
                showJobTitle
                meta={format(parseISO(event.timestamp), "HH:mm")}
              />
            </div>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {format(parseISO(event.timestamp), "HH:mm")}
            </p>
          )}
          {event.eventType === "note_added" && event.attachmentCount ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("entityWorkspace.timeline.attachmentsCount", {
                count: event.attachmentCount,
                defaultValue: "{{count}} attachment(s)",
              })}
            </p>
          ) : null}
          {event.description && event.description !== event.title ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{event.description}</p>
          ) : null}
          {hasChange ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              <span className="line-through opacity-70">{event.oldValue ?? "—"}</span>
              <span className="mx-1.5 text-foreground/40">→</span>
              <span className="font-medium text-foreground">{event.newValue ?? "—"}</span>
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="uppercase tracking-wide">{event.eventType.replaceAll("_", " ")}</span>
            {event.sourceModule ? (
              <span>{t("entityWorkspace.timeline.source", { module: event.sourceModule })}</span>
            ) : null}
          </div>
        </div>
      </div>
  );

  if (onOpenNote) {
    return (
      <button
        type="button"
        onClick={onOpenNote}
        className="mb-3 w-full rounded-xl border border-border/50 bg-background/80 p-3 text-start transition-colors hover:border-primary/30 hover:bg-primary/5"
      >
        {body}
      </button>
    );
  }

  return (
    <article className="mb-3 rounded-xl border border-border/50 bg-background/80 p-3">{body}</article>
  );
}

function groupByDate(events: EntityTimelineEvent[], labels: { today: string; yesterday: string }) {
  const map = new Map<string, EntityTimelineEvent[]>();
  for (const event of events) {
    const date = parseISO(event.timestamp);
    const key = format(date, "yyyy-MM-dd");
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }
  return [...map.entries()].map(([key, groupEvents]) => {
    const date = parseISO(groupEvents[0]!.timestamp);
    let label = format(date, "MMM d, yyyy");
    if (isToday(date)) label = labels.today;
    else if (isYesterday(date)) label = labels.yesterday;
    return { key, label, events: groupEvents };
  });
}
