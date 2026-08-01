import { memo, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bug,
  Clock3,
  FileBarChart2,
  GitBranch,
  Pause,
  Play,
  RotateCcw,
  Square,
  StepForward,
  Variable,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import type { WorkflowDocument } from "../../core/types";
import { filterSimulationTimeline } from "../../simulation/selectors/simulation-selectors";
import type { WorkflowSimulationController } from "../../simulation/hooks/use-workflow-simulation";
import { SimulationTimeline } from "./simulation-timeline";

type SimulationPanelProps = {
  document: WorkflowDocument;
  simulation: WorkflowSimulationController;
  selectedNodeIds: string[];
  onFocusNode: (nodeId: string) => void;
};

type SimulationTab = "timeline" | "variables" | "path" | "state" | "errors" | "logs" | "report";

export const SimulationPanel = memo(function SimulationPanel({
  simulation,
  selectedNodeIds,
  onFocusNode,
}: SimulationPanelProps) {
  const { t } = useTranslation("common");
  const [tab, setTab] = useState<SimulationTab>("timeline");
  const { snapshot } = simulation;

  const timeline = useMemo(() => {
    if (tab === "logs") return snapshot.logs;
    if (tab === "timeline") return snapshot.timeline;
    return filterSimulationTimeline(snapshot.timeline, tab === "variables" ? "variables" : "decisions");
  }, [snapshot.logs, snapshot.timeline, tab]);

  const selectedNodeId = selectedNodeIds[0] ?? null;

  return (
    <DashboardCard className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("workflowBuilder.simulation.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("workflowBuilder.simulation.subtitle")}</p>
        </div>
        <Badge variant="outline">{t(`workflowBuilder.simulation.status.${snapshot.status}`)}</Badge>
      </div>

      {simulation.documentDrift ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("workflowBuilder.simulation.documentDrift.message")}</span>
          </div>
          <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => simulation.restart()}>
            <RotateCcw className="me-2 h-4 w-4" />
            {t("workflowBuilder.simulation.documentDrift.restart")}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="rounded-xl" onClick={() => simulation.start()}>
          <Play className="me-2 h-4 w-4" />
          {t("workflowBuilder.simulation.actions.start")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          disabled={snapshot.status !== "running"}
          onClick={() => simulation.pause()}
        >
          <Pause className="me-2 h-4 w-4" />
          {t("workflowBuilder.simulation.actions.pause")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          disabled={
            (snapshot.status !== "paused" && snapshot.status !== "waiting_input") || simulation.documentDrift
          }
          onClick={() => simulation.resume()}
        >
          <Play className="me-2 h-4 w-4" />
          {t("workflowBuilder.simulation.actions.resume")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          disabled={(!simulation.isActive && snapshot.status === "idle") || simulation.documentDrift}
          onClick={() => simulation.step()}
        >
          <StepForward className="me-2 h-4 w-4" />
          {t("workflowBuilder.simulation.actions.step")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          disabled={snapshot.status === "idle"}
          onClick={() => simulation.restart()}
        >
          <RotateCcw className="me-2 h-4 w-4" />
          {t("workflowBuilder.simulation.actions.restart")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-xl"
          disabled={snapshot.status === "idle"}
          onClick={() => simulation.stop()}
        >
          <Square className="me-2 h-4 w-4" />
          {t("workflowBuilder.simulation.actions.stop")}
        </Button>
        {selectedNodeId ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={() => simulation.toggleBreakpoint(selectedNodeId)}
          >
            <Bug className="me-2 h-4 w-4" />
            {simulation.breakpoints.includes(selectedNodeId)
              ? t("workflowBuilder.simulation.actions.removeBreakpoint")
              : t("workflowBuilder.simulation.actions.addBreakpoint")}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === "timeline"} icon={Clock3} label={t("workflowBuilder.simulation.tabs.timeline")} onClick={() => setTab("timeline")} />
        <TabButton active={tab === "variables"} icon={Variable} label={t("workflowBuilder.simulation.tabs.variables")} onClick={() => setTab("variables")} />
        <TabButton active={tab === "path"} icon={GitBranch} label={t("workflowBuilder.simulation.tabs.path")} onClick={() => setTab("path")} />
        <TabButton active={tab === "state"} icon={FileBarChart2} label={t("workflowBuilder.simulation.tabs.state")} onClick={() => setTab("state")} />
        <TabButton active={tab === "errors"} icon={AlertTriangle} label={t("workflowBuilder.simulation.tabs.errors")} onClick={() => setTab("errors")} />
        <TabButton active={tab === "logs"} icon={Clock3} label={t("workflowBuilder.simulation.tabs.logs")} onClick={() => setTab("logs")} />
        <TabButton active={tab === "report"} icon={FileBarChart2} label={t("workflowBuilder.simulation.tabs.report")} onClick={() => setTab("report")} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/60 p-3">
        {tab === "path" ? (
          <ul className="space-y-2">
            {snapshot.pathExplorer.length > 0 ? (
              snapshot.pathExplorer.map((entry) => (
                <li key={entry.nodeId}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                    onClick={() => onFocusNode(entry.nodeId)}
                  >
                    <span>{entry.label}</span>
                    <Badge variant="outline">{entry.status}</Badge>
                  </button>
                </li>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t("workflowBuilder.simulation.empty")}</p>
            )}
          </ul>
        ) : null}

        {tab === "variables" ? (
          <div className="space-y-3">
            <VariableTable variables={snapshot.variables} title={t("workflowBuilder.simulation.variables.current")} />
            {snapshot.variableMutations.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("workflowBuilder.simulation.variables.mutations")}
                </p>
                <ul className="space-y-2">
                  {snapshot.variableMutations.map((mutation, index) => (
                    <li key={`${mutation.key}-${index}`} className="rounded-lg border border-border/50 px-2 py-1.5 text-xs">
                      <div className="font-medium">{mutation.key}</div>
                      <div className="text-muted-foreground">
                        {String(mutation.previousValue)} → {String(mutation.currentValue)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "state" ? (
          <div className="space-y-3 text-sm">
            <DetailRow label={t("workflowBuilder.simulation.state.currentNode")} value={snapshot.stateInspector.currentNode?.label ?? "—"} />
            <DetailRow label={t("workflowBuilder.simulation.state.workflowState")} value={snapshot.stateInspector.workflowState} />
            <DetailRow
              label={t("workflowBuilder.simulation.state.executedSteps")}
              value={String(snapshot.stateInspector.executionContext.executedSteps ?? 0)}
            />
            <DetailRow
              label={t("workflowBuilder.simulation.state.waitingFor")}
              value={String(snapshot.stateInspector.executionContext.waitingFor ?? "—")}
            />
          </div>
        ) : null}

        {tab === "errors" ? (
          <ul className="space-y-2">
            {[...snapshot.validationIssues.map((issue) => ({
              id: issue.id,
              severity: issue.severity,
              message: issue.message,
            })), ...snapshot.simulationErrors.map((issue) => ({
              id: issue.id,
              severity: issue.severity,
              message: issue.message,
            }))].length > 0 ? (
              [...snapshot.validationIssues.map((issue) => ({
                id: issue.id,
                severity: issue.severity,
                message: issue.message,
              })), ...snapshot.simulationErrors.map((issue) => ({
                id: issue.id,
                severity: issue.severity,
                message: issue.message,
              }))].map((issue) => (
                <li key={issue.id} className="rounded-lg border border-border/50 px-2 py-1.5 text-sm">
                  <Badge variant={issue.severity === "error" ? "destructive" : "secondary"}>{issue.severity}</Badge>
                  <span className="ms-2">{issue.message}</span>
                </li>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t("workflowBuilder.simulation.empty")}</p>
            )}
          </ul>
        ) : null}

        {tab === "report" ? (
          snapshot.report ? (
            <div className="space-y-3 text-sm">
              <DetailRow label={t("workflowBuilder.simulation.report.duration")} value={`${snapshot.report.durationMs}ms`} />
              <DetailRow label={t("workflowBuilder.simulation.report.executed")} value={String(snapshot.report.executedNodeCount)} />
              <DetailRow label={t("workflowBuilder.simulation.report.skipped")} value={String(snapshot.report.skippedNodeCount)} />
              <DetailRow label={t("workflowBuilder.simulation.report.coverage")} value={`${snapshot.report.coveragePercent}%`} />
              <DetailRow label={t("workflowBuilder.simulation.report.readiness")} value={`${snapshot.report.readinessScore}%`} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("workflowBuilder.simulation.report.pending")}</p>
          )
        ) : null}

        {tab === "timeline" || tab === "logs" ? (
          <SimulationTimeline
            entries={timeline}
            companyId={snapshot.companyId ?? ""}
            flowId={snapshot.flowId ?? ""}
          />
        ) : null}
      </div>
    </DashboardCard>
  );
});

function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Play;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button type="button" size="sm" variant={active ? "default" : "outline"} className="rounded-xl" onClick={onClick}>
      <Icon className="me-2 h-4 w-4" />
      {label}
    </Button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function VariableTable({ variables, title }: { variables: Record<string, unknown>; title: string }) {
  const entries = Object.entries(variables).filter(([key]) => !key.startsWith("__"));

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1">
          {entries.map(([key, value]) => (
            <li key={key} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{key}</span>
              <span className="truncate font-medium">{formatValue(value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
