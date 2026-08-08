import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LeadWorkspaceRow } from "@workspace/universal-operations-engine";
import {
  KanbanDrawer,
  type KanbanDrawerAction,
  type KanbanDrawerTab,
} from "@/components/enterprise/kanban";
import { formatBillingCurrency } from "@/lib/billing/format";
import { formatRelativeActivity } from "./lead-kanban-mappers";
import { translateLeadStageLabel } from "./lead-stage-label";

export function LeadKanbanDrawer({
  lead,
  open,
  onOpenChange,
  stageName,
  stageSlug,
  lifecycleStatus,
  aiEnabled,
  onOpenLead360,
  onSendWhatsApp,
  onCreateActivity,
}: {
  lead: LeadWorkspaceRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageName?: string;
  stageSlug?: string;
  lifecycleStatus?: string;
  aiEnabled: boolean;
  onOpenLead360: () => void;
  onSendWhatsApp: () => void;
  onCreateActivity: () => void;
}) {
  const { t, i18n } = useTranslation("common");

  const actions = useMemo((): KanbanDrawerAction[] => {
    if (!lead) return [];
    const lead360Label = t("leads.kanban.drawer.openLead360");
    const whatsappLabel = t("leads.kanban.drawer.sendWhatsApp");
    const activityLabel = t("leads.kanban.drawer.createActivity");
    return [
      {
        id: "lead360",
        label: lead360Label,
        title: lead360Label,
        onClick: onOpenLead360,
        variant: "default",
      },
      {
        id: "whatsapp",
        label: whatsappLabel,
        title: whatsappLabel,
        onClick: onSendWhatsApp,
        disabled: !lead.phone,
      },
      {
        id: "activity",
        label: activityLabel,
        title: activityLabel,
        onClick: onCreateActivity,
      },
    ];
  }, [lead, onCreateActivity, onOpenLead360, onSendWhatsApp, t]);

  const tabs = useMemo((): KanbanDrawerTab[] => {
    if (!lead) return [];
    const stageLabel = translateLeadStageLabel(t, {
      name: stageName ?? lead.stage,
      slug: stageSlug,
      lifecycleStatus: lifecycleStatus ?? lead.lifecycleStatus,
    });

    const sourceKey = lead.source
      ? `leads.sources.${lead.source.toLowerCase().replace(/[\s-]+/g, "_")}`
      : "";
    const sourceLabel =
      lead.source && sourceKey
        ? (() => {
            const translated = t(sourceKey);
            return translated !== sourceKey ? translated : lead.source;
          })()
        : "—";

    const summary = (
      <dl className="grid gap-3 text-[13px]">
        <Row label={t("leads.columns.company")} value={lead.companyName ?? "—"} />
        <Row label={t("leads.columns.stage")} value={stageLabel} />
        <Row
          label={t("leads.columns.expectedValue")}
          value={formatBillingCurrency(lead.expectedValue)}
        />
        <Row label={t("leads.columns.owner")} value={lead.owner ?? "—"} />
        <Row label={t("leads.columns.source")} value={sourceLabel} />
        <Row label={t("leads.workspace.fields.email")} value={lead.email ?? "—"} />
        <Row label={t("leads.workspace.fields.phone")} value={lead.phone ?? "—"} />
        <Row
          label={t("leads.columns.lastActivity")}
          value={
            formatRelativeActivity(t, lead.lastActivityAt, i18n.language) ??
            t("leads.kanban.card.lastActivityNone")
          }
        />
      </dl>
    );

    return [
      {
        id: "summary",
        label: t("leads.kanban.drawer.tabs.summary"),
        content: summary,
      },
      {
        id: "activities",
        label: t("leads.kanban.drawer.tabs.activities"),
        content: (
          <p className="text-[13px] text-muted-foreground">
            {lead.notes?.trim() || t("leads.kanban.drawer.emptyActivities")}
          </p>
        ),
      },
      {
        id: "timeline",
        label: t("leads.kanban.drawer.tabs.timeline"),
        content: (
          <p className="text-[13px] text-muted-foreground">
            {t("leads.kanban.drawer.timelineHint", {
              updated: new Date(lead.updatedAt).toLocaleString(i18n.language),
            })}
          </p>
        ),
      },
      {
        id: "files",
        label: t("leads.kanban.drawer.tabs.files"),
        content: (
          <p className="text-[13px] text-muted-foreground">{t("leads.kanban.drawer.emptyFiles")}</p>
        ),
      },
      {
        id: "ai",
        label: t("leads.kanban.drawer.tabs.ai"),
        content: aiEnabled ? (
          <div className="space-y-3 text-[13px]">
            <Row
              label={t("leads.kanban.ai.winProbabilityLabel")}
              value={t("leads.kanban.ai.winProbability", {
                percent: Math.min(95, Math.max(5, lead.score)),
              })}
            />
            <Row
              label={t("leads.kanban.ai.summaryLabel")}
              value={t("leads.kanban.ai.summaryFallback", { score: lead.score })}
            />
            <Row
              label={t("leads.kanban.ai.nextBestActionLabel")}
              value={t("leads.kanban.ai.nextBestAction")}
            />
            <Row
              label={t("leads.kanban.ai.suggestedFollowUpLabel")}
              value={t("leads.kanban.ai.suggestedFollowUp")}
            />
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">{t("leads.kanban.ai.disabled")}</p>
        ),
      },
      {
        id: "quotes",
        label: t("leads.kanban.drawer.tabs.quotes"),
        content: (
          <p className="text-[13px] text-muted-foreground">{t("leads.kanban.drawer.emptyQuotes")}</p>
        ),
      },
      {
        id: "tasks",
        label: t("leads.kanban.drawer.tabs.tasks"),
        content: (
          <p className="text-[13px] text-muted-foreground">{t("leads.kanban.drawer.emptyTasks")}</p>
        ),
      },
    ];
  }, [aiEnabled, i18n.language, lead, lifecycleStatus, stageName, stageSlug, t]);

  return (
    <KanbanDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={lead?.name || lead?.contactPerson || t("leads.workspace.panelTitle")}
      subtitle={lead?.companyName}
      tabs={tabs}
      actions={actions}
      defaultTab="summary"
    />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
