import { memo } from "react";
import { AlertTriangle, Route, Variable } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TestCaseRunResult } from "../types/testing-types";

type TestingFailureInspectorProps = {
  failure: TestCaseRunResult | null;
  onFocusNode?: (nodeId: string) => void;
};

export const TestingFailureInspector = memo(function TestingFailureInspector({
  failure,
  onFocusNode,
}: TestingFailureInspectorProps) {
  const { t } = useTranslation("common");

  if (!failure) {
    return <p className="text-sm text-muted-foreground">{t("workflowBuilder.testing.empty.failure")}</p>;
  }

  return (
    <div className="grid min-h-0 flex-1 gap-3 overflow-auto lg:grid-cols-2">
      <section className="space-y-2 rounded-xl border border-border/60 p-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <h3 className="text-sm font-semibold">{t("workflowBuilder.testing.failure.title")}</h3>
          <Badge variant="destructive">{failure.caseName}</Badge>
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {failure.failures.map((message) => (
            <li key={message} className="rounded-lg border border-destructive/20 bg-destructive/5 px-2 py-1">
              {message}
            </li>
          ))}
        </ul>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{t("workflowBuilder.testing.failure.duration", { duration: failure.durationMs })}</p>
          <p>{t("workflowBuilder.testing.failure.readiness", { score: failure.snapshotSummary.readinessScore ?? 0 })}</p>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-border/60 p-3">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4" />
          <h3 className="text-sm font-semibold">{t("workflowBuilder.testing.failure.executionPath")}</h3>
        </div>
        {failure.coverage.executedNodeIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("workflowBuilder.testing.empty.path")}</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {failure.coverage.executedNodeIds.map((nodeId) => (
              <li key={nodeId} className="flex items-center justify-between rounded-lg border border-border/50 px-2 py-1">
                <span>{nodeId}</span>
                {onFocusNode ? (
                  <Button type="button" size="sm" variant="ghost" className="h-7 rounded-lg" onClick={() => onFocusNode(nodeId)}>
                    {t("workflowBuilder.testing.actions.focusNode")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-border/60 p-3 lg:col-span-2">
        <div className="flex items-center gap-2">
          <Variable className="h-4 w-4" />
          <h3 className="text-sm font-semibold">{t("workflowBuilder.testing.failure.assertions")}</h3>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {failure.assertionResults.map((result) => (
            <div
              key={result.assertionId}
              className={`rounded-lg border px-2 py-1 text-sm ${
                result.passed ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"
              }`}
            >
              <p className="font-medium">{result.label}</p>
              <p className="text-xs text-muted-foreground">{result.message}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
});
