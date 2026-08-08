import { useTranslation } from "react-i18next";
import { AlertTriangle, Tag } from "lucide-react";
import type { OperationWidgetDefinition } from "@/lib/universal-operations/widget-registry/types";
import { resolveWorkflowState } from "@/lib/universal-operations/widget-registry/workflow-steps";
import { ComingSoonBanner, MetaRow, WidgetCard } from "./shared";
import { OperationWorkflowStrip } from "@/components/universal-operations/operation-workspace/operation-workflow-strip";
import { cn } from "@/lib/utils";

function fmtShort(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return value;
  }
}

export const overviewWidgets: OperationWidgetDefinition[] = [
  {
    id: "operations.summary",
    module: "operations",
    titleKey: "universalOperations.workspace.widgets.operationSummary",
    order: 10,
    tabs: ["overview"],
    visible: () => true,
    Component: ({ ctx }) => {
      const { t } = useTranslation("common");
      const { row } = ctx;
      return (
        <WidgetCard title={t("universalOperations.workspace.widgets.operationSummary")}>
          <MetaRow label={t("universalOperations.workspace.header.reference")} value={String(row.values.reference ?? row.id)} />
          <MetaRow label={t("universalOperations.workspace.header.title")} value={String(row.values.service ?? row.values.customer ?? "—")} />
          <MetaRow label={t("universalOperations.workspace.header.status")} value={String(row.values.status ?? "—")} />
          <MetaRow label={t("universalOperations.workspace.header.priority")} value={row.priority} />
          <MetaRow label={t("universalOperations.workspace.header.assigned")} value={String(row.values.resource ?? "—")} />
        </WidgetCard>
      );
    },
  },
  {
    id: "operations.workflow",
    module: "operations",
    titleKey: "universalOperations.workspace.widgets.currentWorkflow",
    order: 20,
    tabs: ["overview"],
    visible: () => true,
    Component: ({ ctx }) => {
      const { t } = useTranslation("common");
      const state = resolveWorkflowState(ctx.row, ctx.config);
      return (
        <WidgetCard title={t("universalOperations.workspace.widgets.currentWorkflow")}>
          <OperationWorkflowStrip steps={state.steps} currentIndex={state.currentIndex} compact />
        </WidgetCard>
      );
    },
  },
  {
    id: "operations.dates",
    module: "operations",
    titleKey: "universalOperations.workspace.widgets.importantDates",
    order: 30,
    tabs: ["overview"],
    visible: () => true,
    Component: ({ ctx }) => {
      const { t } = useTranslation("common");
      return (
        <WidgetCard title={t("universalOperations.workspace.widgets.importantDates")}>
          <MetaRow label={t("universalOperations.workspace.header.created")} value={fmtShort(ctx.row.createdAt)} />
          <MetaRow label={t("universalOperations.workspace.header.updated")} value={fmtShort(ctx.row.updatedAt)} />
          <MetaRow
            label={t("universalOperations.workspace.widgets.scheduled")}
            value={fmtShort(ctx.row.values.scheduled_at ? String(ctx.row.values.scheduled_at) : null)}
          />
        </WidgetCard>
      );
    },
  },
  {
    id: "operations.owner_priority",
    module: "operations",
    titleKey: "universalOperations.workspace.widgets.ownerPriority",
    order: 40,
    tabs: ["overview"],
    visible: () => true,
    Component: ({ ctx }) => {
      const { t } = useTranslation("common");
      return (
        <WidgetCard title={t("universalOperations.workspace.widgets.ownerPriority")}>
          <MetaRow label={t("universalOperations.workspace.header.assigned")} value={String(ctx.row.values.resource ?? "—")} />
          <MetaRow label={t("universalOperations.workspace.header.priority")} value={ctx.row.priority} />
          <MetaRow label={t("universalOperations.workspace.header.status")} value={String(ctx.row.values.status ?? "—")} />
        </WidgetCard>
      );
    },
  },
  {
    id: "operations.tags",
    module: "operations",
    titleKey: "universalOperations.workspace.widgets.tags",
    order: 50,
    tabs: ["overview"],
    visible: () => true,
    Component: ({ ctx }) => {
      const { t } = useTranslation("common");
      const tags = ctx.row.tags?.length
        ? ctx.row.tags
        : Array.isArray(ctx.row.values.tags)
          ? ctx.row.values.tags.map(String)
          : [];
      return (
        <WidgetCard title={t("universalOperations.workspace.widgets.tags")}>
          {tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("universalOperations.workspace.empty.tags")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px]"
                >
                  <Tag className="size-3" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </WidgetCard>
      );
    },
  },
  {
    id: "operations.warnings",
    module: "operations",
    titleKey: "universalOperations.workspace.widgets.warnings",
    order: 60,
    tabs: ["overview"],
    visible: (ctx) => {
      const waiting = Number(ctx.row.values.waiting_minutes) || 0;
      const unpaid = String(ctx.row.values.payment_status ?? "").toLowerCase().includes("unpaid")
        || ctx.row.paymentStatusId.includes("unpaid");
      return waiting > 30 || unpaid || ctx.row.priority === "urgent" || ctx.row.priority === "high";
    },
    Component: ({ ctx }) => {
      const { t } = useTranslation("common");
      const waiting = Number(ctx.row.values.waiting_minutes) || 0;
      const warnings: string[] = [];
      if (waiting > 30) warnings.push(t("universalOperations.workspace.warnings.longWait", { minutes: waiting }));
      if (String(ctx.row.values.payment_status ?? "").toLowerCase().includes("unpaid") || ctx.row.paymentStatusId.includes("unpaid")) {
        warnings.push(t("universalOperations.workspace.warnings.unpaid"));
      }
      if (ctx.row.priority === "urgent" || ctx.row.priority === "high") {
        warnings.push(t("universalOperations.workspace.warnings.highPriority", { priority: ctx.row.priority }));
      }
      return (
        <WidgetCard title={t("universalOperations.workspace.widgets.warnings")}>
          <ul className="space-y-1.5">
            {warnings.map((warning) => (
              <li key={warning} className={cn("flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400")}>
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </WidgetCard>
      );
    },
  },
  {
    id: "appointments.appointment",
    module: "appointments",
    titleKey: "universalOperations.workspace.widgets.appointment",
    order: 70,
    tabs: ["overview"],
    visible: (ctx) => Boolean(ctx.customer360?.todaysOperation || ctx.row.values.service),
    Component: ({ ctx }) => {
      const { t } = useTranslation("common");
      const op = ctx.customer360?.todaysOperation;
      return (
        <WidgetCard title={t("universalOperations.workspace.widgets.appointment")}>
          <MetaRow label={t("universalOperations.workspace.widgets.service")} value={String(op?.service ?? ctx.row.values.service ?? "—")} />
          <MetaRow label={t("universalOperations.workspace.header.assigned")} value={String(op?.assignedEmployee ?? ctx.row.values.resource ?? "—")} />
          <MetaRow label={t("universalOperations.workspace.widgets.scheduled")} value={fmtShort(op?.scheduledAt ?? (ctx.row.values.scheduled_at ? String(ctx.row.values.scheduled_at) : null))} />
        </WidgetCard>
      );
    },
  },
  {
    id: "ai.summary",
    module: "ai",
    titleKey: "universalOperations.workspace.widgets.aiSummary",
    order: 80,
    tabs: ["overview", "ai"],
    comingSoon: true,
    visible: () => true,
    Component: () => {
      const { t } = useTranslation("common");
      return (
        <WidgetCard title={t("universalOperations.workspace.widgets.aiSummary")}>
          <ComingSoonBanner label={t("universalOperations.workspace.comingSoon")} />
        </WidgetCard>
      );
    },
  },
];
