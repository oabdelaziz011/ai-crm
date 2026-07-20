import { summarizeComparison } from "@workspace/automation-platform";
import type { WorkflowVersionComparison } from "@workspace/automation-platform";
import { useWorkflowBuilderI18n } from "../../hooks/use-workflow-builder-i18n";

export function VersionCompareView({ comparison }: { comparison: WorkflowVersionComparison }) {
  const { wb } = useWorkflowBuilderI18n();
  const summary = summarizeComparison(comparison);

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-background/60 p-4">
      <div>
        <p className="text-sm font-semibold">{wb("versionHistory.whatChanged")}</p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {summary.map((line) => (
            <li key={line}>• {line}</li>
          ))}
        </ul>
      </div>
      {comparison.addedNodes.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
            {wb("versionHistory.addedSteps")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {comparison.addedNodes.map((node) => (
              <span key={node} className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-700 dark:text-emerald-300">
                {node}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {comparison.removedNodes.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-300">
            {wb("versionHistory.removedSteps")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {comparison.removedNodes.map((node) => (
              <span key={node} className="rounded-full bg-rose-500/10 px-3 py-1 text-xs text-rose-700 dark:text-rose-300">
                {node}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {comparison.changedNodeProperties.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">
            {wb("versionHistory.changedSettings")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {comparison.changedNodeProperties.map((node) => (
              <span key={node.nodeId} className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-700 dark:text-amber-300">
                {node.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
