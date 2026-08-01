import { lazy, memo, Suspense, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Copy,
  FileBarChart2,
  FlaskConical,
  History,
  Play,
  Plus,
  ShieldCheck,
  TestTube2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import type { WorkflowTestingController } from "../hooks/use-workflow-testing";
import type { TestCaseRunResult } from "../types/testing-types";

const TestingFailureInspector = lazy(() =>
  import("./testing-failure-inspector").then((module) => ({ default: module.TestingFailureInspector })),
);

type TestingPanelProps = {
  testing: WorkflowTestingController;
  onFocusNode?: (nodeId: string) => void;
};

type TestingTab = "suites" | "cases" | "regression" | "coverage" | "history" | "failure" | "report";

function StatusBadge({ status }: { status: TestCaseRunResult["status"] }) {
  const { t } = useTranslation("common");
  const variant =
    status === "passed" ? "default" : status === "failed" ? "destructive" : status === "running" ? "secondary" : "outline";
  return <Badge variant={variant}>{t(`workflowBuilder.testing.status.${status}`)}</Badge>;
}

export const TestingPanel = memo(function TestingPanel({ testing, onFocusNode }: TestingPanelProps) {
  const { t } = useTranslation("common");
  const [tab, setTab] = useState<TestingTab>("suites");
  const { viewModel } = testing;

  const handleCreateSuite = () => {
    testing.createSuite(t("workflowBuilder.testing.defaults.suiteName"));
  };

  const handleCreateCase = () => {
    if (!testing.selectedSuiteId) return;
    testing.createCase(testing.selectedSuiteId, {
      name: t("workflowBuilder.testing.defaults.caseName"),
      mockVariables: {
        "customer.name": "Test Customer",
        "conversation.last_message": "Workflow test message",
      },
      assertions: [
        {
          id: `assertion-readiness-${Date.now()}`,
          kind: "report_score",
          label: t("workflowBuilder.testing.defaults.readinessAssertion"),
          minScore: 0,
        },
      ],
    });
  };

  return (
    <DashboardCard className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("workflowBuilder.testing.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("workflowBuilder.testing.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            <ShieldCheck className="me-1 h-3.5 w-3.5" />
            {t("workflowBuilder.testing.isolatedBadge")}
          </Badge>
          {viewModel.latestRun ? <StatusBadge status={viewModel.latestRun.failed > 0 ? "failed" : "passed"} /> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["suites", TestTube2],
            ["cases", FlaskConical],
            ["regression", Play],
            ["coverage", FileBarChart2],
            ["history", History],
            ["failure", Archive],
            ["report", FileBarChart2],
          ] as const
        ).map(([key, Icon]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={tab === key ? "default" : "outline"}
            className="rounded-xl"
            onClick={() => setTab(key)}
          >
            <Icon className="me-2 h-4 w-4" />
            {t(`workflowBuilder.testing.tabs.${key}`)}
          </Button>
        ))}
      </div>

      {tab === "suites" ? (
        <div className="grid min-h-0 flex-1 gap-3 overflow-auto md:grid-cols-2">
          <section className="space-y-2 rounded-xl border border-border/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{t("workflowBuilder.testing.sections.activeSuites")}</h3>
              <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={handleCreateSuite}>
                <Plus className="me-2 h-4 w-4" />
                {t("workflowBuilder.testing.actions.createSuite")}
              </Button>
            </div>
            {viewModel.suites.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("workflowBuilder.testing.empty.suites")}</p>
            ) : (
              viewModel.suites.map((suite) => (
                <button
                  key={suite.id}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-start text-sm ${
                    testing.selectedSuiteId === suite.id ? "border-primary bg-primary/5" : "border-border/60"
                  }`}
                  onClick={() => testing.setSelectedSuiteId(suite.id)}
                >
                  <span>
                    <span className="font-medium">{suite.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t("workflowBuilder.testing.labels.caseCount", { count: suite.activeCaseCount })}
                    </span>
                  </span>
                  <span className="flex gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg"
                      aria-label={t("workflowBuilder.testing.actions.duplicateSuite")}
                      onClick={(event) => {
                        event.stopPropagation();
                        testing.duplicateSuite(suite.id);
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-lg"
                      aria-label={t("workflowBuilder.testing.actions.archiveSuite")}
                      onClick={(event) => {
                        event.stopPropagation();
                        testing.archiveSuite(suite.id);
                      }}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </span>
                </button>
              ))
            )}
          </section>
          <section className="space-y-2 rounded-xl border border-border/60 p-3">
            <h3 className="text-sm font-semibold">{t("workflowBuilder.testing.sections.archivedSuites")}</h3>
            {viewModel.archivedSuites.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("workflowBuilder.testing.empty.archivedSuites")}</p>
            ) : (
              viewModel.archivedSuites.map((suite) => (
                <div key={suite.id} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm">
                  <span>{suite.name}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => testing.restoreSuite(suite.id)}
                  >
                    <ArchiveRestore className="me-2 h-4 w-4" />
                    {t("workflowBuilder.testing.actions.restoreSuite")}
                  </Button>
                </div>
              ))
            )}
          </section>
        </div>
      ) : null}

      {tab === "cases" ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-auto">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("workflowBuilder.testing.sections.testCases")}</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl"
              disabled={!testing.selectedSuiteId}
              onClick={handleCreateCase}
            >
              <Plus className="me-2 h-4 w-4" />
              {t("workflowBuilder.testing.actions.createCase")}
            </Button>
          </div>
          {viewModel.cases.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("workflowBuilder.testing.empty.cases")}</p>
          ) : (
            viewModel.cases.map((testCase) => (
              <div key={testCase.id} className="rounded-xl border border-border/60 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{testCase.name}</p>
                    <p className="text-xs text-muted-foreground">{testCase.description || t("workflowBuilder.testing.empty.description")}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => void testing.runCase(testCase.id)}>
                      <Play className="me-2 h-4 w-4" />
                      {t("workflowBuilder.testing.actions.runCase")}
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => testing.duplicateCase(testCase.id)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => testing.archiveCase(testCase.id)}>
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("workflowBuilder.testing.labels.assertionCount", { count: testCase.assertions.length })}
                </p>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === "regression" ? (
        <div className="space-y-3">
          <Button
            type="button"
            className="rounded-xl"
            disabled={!testing.selectedSuiteId || testing.isRunning}
            onClick={() => void testing.runSelectedSuite()}
          >
            <Play className="me-2 h-4 w-4" />
            {testing.isRunning ? t("workflowBuilder.testing.actions.running") : t("workflowBuilder.testing.actions.runSuite")}
          </Button>
          {viewModel.latestRun ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <MetricCard label={t("workflowBuilder.testing.report.passed")} value={String(viewModel.latestRun.passed)} />
              <MetricCard label={t("workflowBuilder.testing.report.failed")} value={String(viewModel.latestRun.failed)} />
              <MetricCard label={t("workflowBuilder.testing.report.skipped")} value={String(viewModel.latestRun.skipped)} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("workflowBuilder.testing.empty.runs")}</p>
          )}
        </div>
      ) : null}

      {tab === "coverage" && viewModel.coverage ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <MetricCard label={t("workflowBuilder.testing.coverage.nodes")} value={`${viewModel.coverage.nodeCoveragePercent}%`} />
          <MetricCard label={t("workflowBuilder.testing.coverage.branches")} value={`${viewModel.coverage.branchCoveragePercent}%`} />
          <MetricCard label={t("workflowBuilder.testing.coverage.triggers")} value={`${viewModel.coverage.triggerCoveragePercent}%`} />
          <MetricCard label={t("workflowBuilder.testing.coverage.assertions")} value={`${viewModel.coverage.assertionCoveragePercent}%`} />
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-auto">
          {viewModel.runHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("workflowBuilder.testing.empty.history")}</p>
          ) : (
            viewModel.runHistory.map((run) => (
              <div key={run.id} className="rounded-xl border border-border/60 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{run.suiteName}</p>
                    <p className="text-xs text-muted-foreground">{run.startedAt}</p>
                  </div>
                  <Badge variant="outline">{run.report.readinessScore}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("workflowBuilder.testing.labels.runSummary", {
                    passed: run.passed,
                    failed: run.failed,
                    skipped: run.skipped,
                    duration: run.durationMs,
                  })}
                </p>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === "failure" ? (
        <Suspense fallback={<p className="text-sm text-muted-foreground">{t("workflowBuilder.testing.loading")}</p>}>
          <TestingFailureInspector failure={testing.selectedFailure} onFocusNode={onFocusNode} />
        </Suspense>
      ) : null}

      {tab === "report" && viewModel.report ? (
        <div className="space-y-3 overflow-auto text-sm">
          <div className="grid gap-2 sm:grid-cols-4">
            <MetricCard label={t("workflowBuilder.testing.report.passed")} value={String(viewModel.report.passed)} />
            <MetricCard label={t("workflowBuilder.testing.report.failed")} value={String(viewModel.report.failed)} />
            <MetricCard label={t("workflowBuilder.testing.report.skipped")} value={String(viewModel.report.skipped)} />
            <MetricCard label={t("workflowBuilder.testing.report.readiness")} value={String(viewModel.report.readinessScore)} />
          </div>
          {viewModel.report.warnings.length > 0 ? (
            <section>
              <h3 className="mb-1 font-semibold">{t("workflowBuilder.testing.report.warnings")}</h3>
              <ul className="list-disc ps-5 text-muted-foreground">
                {viewModel.report.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {viewModel.report.bottlenecks.length > 0 ? (
            <section>
              <h3 className="mb-1 font-semibold">{t("workflowBuilder.testing.report.bottlenecks")}</h3>
              <ul className="list-disc ps-5 text-muted-foreground">
                {viewModel.report.bottlenecks.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </DashboardCard>
  );
});

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
