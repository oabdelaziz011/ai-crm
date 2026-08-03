import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityGroup } from "@workspace/universal-workspace-platform";
import { Activity } from "lucide-react";
import {
  translateActivityActor,
  translateActivityDescription,
  translateActivityTitle,
} from "@/lib/i18n/workspace-mock-labels";

export const WorkspaceActivityStream = memo(function WorkspaceActivityStream({
  groups,
  search,
  onSearchChange,
}: {
  groups: ActivityGroup[];
  search?: string;
  onSearchChange?: (v: string) => void;
}) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-6">
      {onSearchChange && (
        <input
          type="search"
          value={search ?? ""}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("workspacePlatform.activity.search")}
          className="h-9 w-full max-w-md rounded-xl border border-border/60 bg-background/50 px-4 text-sm"
        />
      )}
      {groups.map((group) => (
        <div key={group.period}>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {t(`workspacePlatform.${group.labelKey}`)}
          </p>
          <div className="space-y-2">
            {group.events.map((event) => (
              <div
                key={event.id}
                className="flex gap-3 rounded-xl border border-border/50 bg-card/80 px-4 py-3 transition-colors hover:bg-card"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Activity className="size-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{translateActivityTitle(t, event.id, event.title)}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(event.occurredAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {translateActivityDescription(t, event.id, event.description)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {translateActivityActor(t, event.id, event.actor)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});
