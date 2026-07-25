import { useEffect, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VersionCompareView } from "./version-compare-view";
import { useWorkflowBuilderI18n } from "../../hooks/use-workflow-builder-i18n";
import type { WorkflowRepository } from "../../core/persistence/workflow-repository";
import type { ServiceContext } from "@workspace/automation-platform";
import type { WorkflowVersionSummary } from "../../core/types";

type VersionHistoryPanelProps = {
  flowId: string;
  repository: WorkflowRepository;
  context: ServiceContext;
  canRollback: boolean;
  onRollback: (versionNumber: number) => Promise<void>;
};

export function VersionHistoryPanel({ flowId, repository, context, canRollback, onRollback }: VersionHistoryPanelProps) {
  const { wb } = useWorkflowBuilderI18n();
  const [versions, setVersions] = useState<WorkflowVersionSummary[]>([]);
  const [compareLeft, setCompareLeft] = useState<string | null>(null);
  const [compareRight, setCompareRight] = useState<string | null>(null);
  const [comparison, setComparison] = useState<Awaited<ReturnType<WorkflowRepository["compareVersions"]>> | null>(null);

  const load = async () => {
    const records = await repository.listVersions(flowId);
    setVersions(records);
    if (records.length >= 2) {
      setCompareLeft(records[1]?.versionId ?? null);
      setCompareRight(records[0]?.versionId ?? null);
    }
  };

  useEffect(() => {
    void load();
  }, [flowId]);

  const runCompare = async () => {
    if (!compareLeft || !compareRight) return;
    setComparison(await repository.compareVersions(compareLeft, compareRight));
  };

  return (
    <aside className="flex shrink-0 flex-col gap-4 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-lg">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">{wb("versionHistory.title")}</p>
      </div>
      <div className="space-y-3">
        {versions.map((version) => (
          <div key={version.versionId} className="rounded-2xl border border-border/60 bg-background/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{wb("versionHistory.version", { number: version.versionNumber })}</p>
              {version.isActive ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                  {wb("versionHistory.active")}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {version.releaseNotes || wb("versionHistory.noReleaseNotes")}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {version.publishedAt ? new Date(version.publishedAt).toLocaleString() : wb("versionHistory.notPublished")}
            </p>
            {canRollback && !version.isActive ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full rounded-xl"
                onClick={() => void onRollback(version.versionNumber)}
              >
                <RotateCcw className="me-2 h-4 w-4" />
                {wb("actions.rollback")}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      {versions.length >= 2 ? (
        <div className="space-y-3 border-t border-border/60 pt-4">
          <p className="text-sm font-semibold">{wb("versionHistory.compareTitle")}</p>
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => void runCompare()}>
            {wb("actions.compareSelected")}
          </Button>
          {comparison ? <VersionCompareView comparison={comparison} /> : null}
        </div>
      ) : null}
    </aside>
  );
}
