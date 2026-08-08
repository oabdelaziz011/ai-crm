import { memo } from "react";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { useEntityWorkspace } from "@/context/entity-workspace-context";
import { EntityTimelinePanel } from "@/components/entity-workspace/panels/entity-timeline-panel";

type Props = {
  searchQuery?: string;
  onOpenNote?: (noteId: string) => void;
};

export const EntityWorkspaceSidebar = memo(function EntityWorkspaceSidebar({
  searchQuery = "",
  onOpenNote,
}: Props) {
  const { t } = useTranslation("common");
  const { operation, tags, customFields, tasks } = useEntityWorkspace();

  const status = String(operation?.values.status ?? operation?.statusId ?? "").trim();
  const resource = String(operation?.values.resource ?? "").trim();
  const upcoming = tasks
    .filter((task) => !task.completedAt && task.status !== "completed" && task.status !== "done")
    .slice(0, 4);
  const pinned = [
    ...tags.map((tag) => tag.name),
    ...customFields.filter((f) => f.value?.trim()).slice(0, 3).map((f) => `${f.label}: ${f.value}`),
  ];

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold">{t("entityWorkspace.sidebar.status")}</h3>
        <div className="mt-3 space-y-2 text-sm">
          {status ? (
            <div className="rounded-xl bg-muted/30 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t("entityWorkspace.panels.operationStatus")}
              </p>
              <p className="font-medium">{status}</p>
            </div>
          ) : null}
          {resource && resource !== "—" ? (
            <div className="rounded-xl bg-muted/30 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t("entityWorkspace.panels.assignedResource")}
              </p>
              <p className="font-medium">{resource}</p>
            </div>
          ) : null}
          {!status && (!resource || resource === "—") ? (
            <p className="text-xs text-muted-foreground">{t("entityWorkspace.operation.noContext")}</p>
          ) : null}
        </div>
      </section>

      {upcoming.length > 0 ? (
        <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold">{t("entityWorkspace.sidebar.upcoming")}</h3>
          <ul className="mt-3 space-y-2">
            {upcoming.map((task) => (
              <li key={task.id} className="rounded-xl bg-muted/30 px-3 py-2 text-sm">
                <p className="font-medium">{task.title}</p>
                {task.dueAt ? (
                  <p className="text-[11px] text-muted-foreground">
                    {format(parseISO(task.dueAt), "MMM d, yyyy")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pinned.length > 0 ? (
        <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold">{t("entityWorkspace.sidebar.pinned")}</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pinned.map((item) => (
              <span
                key={item}
                className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium"
              >
                {item}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <EntityTimelinePanel
        searchQuery={searchQuery}
        sticky
        dense
        titleKey="entityWorkspace.sidebar.recentActivity"
        onOpenNote={onOpenNote}
      />
    </div>
  );
});
