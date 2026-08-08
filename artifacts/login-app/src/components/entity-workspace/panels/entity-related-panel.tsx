import { memo } from "react";
import {
  CalendarDays,
  FileText,
  FolderOpen,
  ListTodo,
  MessageSquare,
  StickyNote,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEntityWorkspace } from "@/context/entity-workspace-context";
import type { EntityWorkspaceTabId } from "@/lib/entity-workspace";
import { cn } from "@/lib/utils";

type Props = {
  onOpenTab: (tab: EntityWorkspaceTabId) => void;
};

export const EntityRelatedPanel = memo(function EntityRelatedPanel({ onOpenTab }: Props) {
  const { t } = useTranslation("common");
  const { related, permissions, entityType } = useEntityWorkspace();

  if (entityType !== "customer") return null;

  const items: Array<{
    key: string;
    label: string;
    value: number;
    icon: typeof StickyNote;
    tab?: EntityWorkspaceTabId;
  }> = [
    {
      key: "notes",
      label: t("entityWorkspace.related.notes"),
      value: related.notes,
      icon: StickyNote,
      tab: "notes",
    },
    {
      key: "files",
      label: t("entityWorkspace.related.files"),
      value: related.files,
      icon: FolderOpen,
      tab: "files",
    },
    ...(permissions.canReadInvoices
      ? [
          {
            key: "invoices",
            label: t("entityWorkspace.related.invoices"),
            value: related.invoices,
            icon: FileText,
          },
        ]
      : []),
    {
      key: "bookings",
      label: t("entityWorkspace.related.bookings"),
      value: related.bookings,
      icon: CalendarDays,
    },
    {
      key: "messages",
      label: t("entityWorkspace.related.messages"),
      value: related.messages,
      icon: MessageSquare,
      tab: "communication",
    },
    ...(permissions.canReadTasks
      ? [
          {
            key: "tasks",
            label: t("entityWorkspace.related.tasks", { defaultValue: "Tasks" }),
            value: related.tasks,
            icon: ListTodo,
            tab: "tasks" as const,
          },
        ]
      : []),
  ];

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold tracking-tight">{t("entityWorkspace.panels.relatedRecords")}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("entityWorkspace.related.liveHint")}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          const className = cn(
            "rounded-xl border border-border/50 bg-muted/25 px-3 py-3 text-center",
            item.tab && "transition-colors hover:border-primary/30 hover:bg-primary/5",
          );
          const body = (
            <>
              <Icon className="mx-auto size-4 text-primary" />
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{item.value}</p>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">{item.label}</p>
            </>
          );
          if (item.tab) {
            return (
              <button key={item.key} type="button" onClick={() => onOpenTab(item.tab!)} className={className}>
                {body}
              </button>
            );
          }
          return (
            <div key={item.key} className={className}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
});
