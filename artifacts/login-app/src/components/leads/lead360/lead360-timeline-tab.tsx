import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Cog, History, UserRound } from "lucide-react";
import type { TimelineItemDto, LeadAiAuditEntry } from "@workspace/application-layer";
import type { Lead360AiPanelDto } from "@/lib/lead-intelligence/lead360-ai-types";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { cn } from "@/lib/utils";

type TimelineKind = "crm" | "ai" | "automation";

type UnifiedEvent = {
  id: string;
  at: string;
  title: string;
  detail?: string | null;
  kind: TimelineKind;
};

function classify(type: string): TimelineKind {
  const value = type.toLowerCase();
  if (/ai_|intelligence|prospect|analysis|provider|score|summary/.test(value)) return "ai";
  if (/workflow|automation|trigger/.test(value)) return "automation";
  return "crm";
}

export function Lead360TimelineTab({
  timeline,
  aiAudit,
  panel,
}: {
  timeline: readonly TimelineItemDto[];
  aiAudit?: readonly LeadAiAuditEntry[];
  panel?: Lead360AiPanelDto | null;
}) {
  const { t, i18n } = useTranslation("common");

  const events = useMemo(() => {
    const rows: UnifiedEvent[] = [];

    for (const item of timeline) {
      rows.push({
        id: `tl-${item.id}`,
        at: item.occurredAt,
        title: item.title || item.eventType,
        detail: item.description ?? null,
        kind: classify(item.eventType || item.title || ""),
      });
    }

    for (const entry of aiAudit ?? []) {
      rows.push({
        id: `audit-${entry.id}`,
        at: entry.createdAt,
        title: entry.decision,
        detail: entry.reason,
        kind: "ai",
      });
    }

    if (panel?.intelligence) {
      rows.push({
        id: `intel-${panel.intelligence.analyzedAt}`,
        at: panel.intelligence.analyzedAt,
        title: t("leads360.timeline.aiAnalyzed", { defaultValue: "AI analysis completed" }),
        detail: panel.intelligence.summary.value,
        kind: "ai",
      });
    }

    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [timeline, aiAudit, panel, t]);

  if (events.length === 0) {
    return (
      <EnterpriseEmptyState
        compact
        icon={<History className="size-6" aria-hidden />}
        title={t("leads360.empty.timelineTitle", {
          defaultValue: "Timeline is empty",
        })}
        description={t("leads360.empty.timeline", {
          defaultValue:
            "CRM updates, AI decisions, and automations will form a single storyline here as work progresses.",
        })}
      />
    );
  }

  return (
    <ol className="relative space-y-0 border-s border-border/50 ps-5">
      {events.map((event) => (
        <li key={event.id} className="relative pb-5 last:pb-0">
          <span
            className={cn(
              "absolute -start-[1.55rem] top-1 flex size-6 items-center justify-center rounded-full border bg-background",
              event.kind === "ai" && "border-violet-500/30 text-violet-700 dark:text-violet-300",
              event.kind === "crm" && "border-foreground/20 text-foreground",
              event.kind === "automation" && "border-sky-500/30 text-sky-700 dark:text-sky-300",
            )}
            aria-label={event.kind}
          >
            {event.kind === "ai" ? (
              <Bot className="size-3.5" aria-hidden />
            ) : event.kind === "automation" ? (
              <Cog className="size-3.5" aria-hidden />
            ) : (
              <UserRound className="size-3.5" aria-hidden />
            )}
          </span>
          <div className="animate-in fade-in-0 rounded-lg border border-border/40 bg-card/60 px-3 py-2.5 duration-300">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-foreground">{event.title}</p>
              <time className="text-[11px] text-muted-foreground">
                {new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(event.at))}
              </time>
            </div>
            {event.detail ? (
              <p className="mt-1 text-[12px] text-muted-foreground">{event.detail}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
