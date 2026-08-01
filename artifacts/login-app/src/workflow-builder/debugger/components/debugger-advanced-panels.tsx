import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DebuggerAdvancedViewModel } from "../types/debugger-advanced-types";
import type { DebuggerBreakpointKind } from "../types/debugger-kernel-types";

type BreakpointsPanelProps = {
  model: DebuggerAdvancedViewModel;
  onAdd: (kind: DebuggerBreakpointKind) => void;
  onRemove: (breakpointId: string) => void;
  onToggle: (breakpointId: string, enabled: boolean) => void;
};

export const BreakpointsPanel = memo(function BreakpointsPanel({ model, onAdd, onRemove, onToggle }: BreakpointsPanelProps) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => onAdd("node")}>
          {t("workflowBuilder.debugger.advanced.breakpoints.addNode")}
        </Button>
        <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => onAdd("variable_equals")}>
          {t("workflowBuilder.debugger.advanced.breakpoints.addVariable")}
        </Button>
        <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => onAdd("expression")}>
          {t("workflowBuilder.debugger.advanced.breakpoints.addExpression")}
        </Button>
        <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => onAdd("execution_count")}>
          {t("workflowBuilder.debugger.advanced.breakpoints.addExecutionCount")}
        </Button>
      </div>
      {model.breakpoints.length === 0 ? (
        <p className="text-muted-foreground">{t("workflowBuilder.debugger.advanced.breakpoints.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {model.breakpoints.map((breakpoint) => (
            <li key={breakpoint.id} className="rounded-lg border border-border/50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{breakpoint.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{breakpoint.kind}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{t("workflowBuilder.debugger.advanced.breakpoints.hits", { count: breakpoint.hitCount })}</Badge>
                  <Button type="button" size="sm" variant={breakpoint.enabled ? "default" : "outline"} onClick={() => onToggle(breakpoint.id, !breakpoint.enabled)}>
                    {breakpoint.enabled ? t("workflowBuilder.debugger.advanced.enabled") : t("workflowBuilder.debugger.advanced.disabled")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onRemove(breakpoint.id)}>
                    {t("workflowBuilder.debugger.advanced.remove")}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {model.breakpointHits.length > 0 ? (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("workflowBuilder.debugger.advanced.breakpoints.recentHits")}
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {model.breakpointHits.slice(-5).reverse().map((hit) => (
              <li key={`${hit.breakpointId}-${hit.frameIndex}-${hit.timestamp}`}>{hit.reason}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
});

type WatchesPanelProps = {
  model: DebuggerAdvancedViewModel;
  onAdd: (expression: string) => void;
  onRemove: (watchId: string) => void;
  onToggle: (watchId: string, enabled: boolean) => void;
};

export const WatchesPanel = memo(function WatchesPanel({ model, onAdd, onRemove, onToggle }: WatchesPanelProps) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-3 text-sm">
      <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => onAdd("count")}>
        {t("workflowBuilder.debugger.advanced.watches.add")}
      </Button>
      {model.watches.length === 0 ? (
        <p className="text-muted-foreground">{t("workflowBuilder.debugger.advanced.watches.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {model.watches.map((watch) => (
            <li key={watch.watchId} className="rounded-lg border border-border/50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{watch.label ?? watch.expression}</div>
                  <div className="mt-1 font-mono text-xs">{watch.displayValue}</div>
                  {watch.error ? <div className="mt-1 text-xs text-destructive">{watch.error}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant={watch.enabled ? "default" : "outline"} onClick={() => onToggle(watch.watchId, !watch.enabled)}>
                    {watch.enabled ? t("workflowBuilder.debugger.advanced.enabled") : t("workflowBuilder.debugger.advanced.disabled")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onRemove(watch.watchId)}>
                    {t("workflowBuilder.debugger.advanced.remove")}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

type ExpressionEvaluatorPanelProps = {
  model: DebuggerAdvancedViewModel;
  onChange: (expression: string) => void;
};

export const ExpressionEvaluatorPanel = memo(function ExpressionEvaluatorPanel({ model, onChange }: ExpressionEvaluatorPanelProps) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-3 text-sm">
      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("workflowBuilder.debugger.advanced.expression.label")}
        </span>
        <input
          className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 font-mono text-sm"
          value={model.expressionDraft ?? ""}
          placeholder={t("workflowBuilder.debugger.advanced.expression.placeholder")}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {model.expressionResult ? (
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <div className="text-xs text-muted-foreground">{t("workflowBuilder.debugger.advanced.expression.result")}</div>
          <div className="mt-1 font-mono">{model.expressionResult.displayValue}</div>
          {model.expressionResult.error ? <div className="mt-1 text-xs text-destructive">{model.expressionResult.error}</div> : null}
        </div>
      ) : null}
    </div>
  );
});

type ProfilerPanelProps = {
  model: DebuggerAdvancedViewModel;
};

export const ProfilerPanel = memo(function ProfilerPanel({ model }: ProfilerPanelProps) {
  const { t } = useTranslation("common");

  if (model.profiler.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("workflowBuilder.debugger.empty")}</p>;
  }

  return (
    <ul className="space-y-2 text-sm">
      {model.profiler.map((entry) => (
        <li key={entry.nodeId} className="rounded-lg border border-border/50 px-3 py-2">
          <div className="font-medium">{entry.label}</div>
          <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <span>{t("workflowBuilder.debugger.advanced.profiler.executions", { count: entry.executionCount })}</span>
            <span>{t("workflowBuilder.debugger.advanced.profiler.avg", { ms: Math.round(entry.averageDurationMs) })}</span>
            <span>{t("workflowBuilder.debugger.advanced.profiler.min", { ms: Math.round(entry.minDurationMs) })}</span>
            <span>{t("workflowBuilder.debugger.advanced.profiler.max", { ms: Math.round(entry.maxDurationMs) })}</span>
            <span className="col-span-2">{t("workflowBuilder.debugger.advanced.profiler.total", { ms: Math.round(entry.totalDurationMs) })}</span>
          </div>
        </li>
      ))}
    </ul>
  );
});

type PerformanceTimelinePanelProps = {
  model: DebuggerAdvancedViewModel;
};

export const PerformanceTimelinePanel = memo(function PerformanceTimelinePanel({ model }: PerformanceTimelinePanelProps) {
  const { t } = useTranslation("common");

  if (model.performanceTimeline.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("workflowBuilder.debugger.advanced.performance.empty")}</p>;
  }

  return (
    <ul className="space-y-2 text-sm">
      {model.performanceTimeline.map((entry) => (
        <li key={entry.eventId} className="rounded-lg border border-border/50 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{entry.label}</span>
            <Badge variant="outline">{t(`workflowBuilder.debugger.advanced.performance.kind.${entry.kind}`)}</Badge>
          </div>
          {entry.durationMs != null ? (
            <div className="mt-1 text-xs text-muted-foreground">
              {t("workflowBuilder.debugger.advanced.performance.duration", { ms: Math.round(entry.durationMs) })}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
});

type HotPathPanelProps = {
  model: DebuggerAdvancedViewModel;
};

export const HotPathPanel = memo(function HotPathPanel({ model }: HotPathPanelProps) {
  const { t } = useTranslation("common");

  if (model.hotPaths.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("workflowBuilder.debugger.advanced.hotPath.empty")}</p>;
  }

  return (
    <ul className="space-y-2 text-sm">
      {model.hotPaths.map((path) => (
        <li key={`${path.kind}-${path.pathId}`} className="rounded-lg border border-border/50 px-3 py-2">
          <div className="font-medium">{t(`workflowBuilder.debugger.advanced.hotPath.kind.${path.kind}`)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{path.labels.join(" → ")}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t("workflowBuilder.debugger.advanced.hotPath.meta", {
              visits: path.visitCount,
              ms: Math.round(path.totalDurationMs),
            })}
          </div>
        </li>
      ))}
    </ul>
  );
});

type ExecutionMetricsPanelProps = {
  model: DebuggerAdvancedViewModel;
};

export const ExecutionMetricsPanel = memo(function ExecutionMetricsPanel({ model }: ExecutionMetricsPanelProps) {
  const { t } = useTranslation("common");
  const metrics = model.metrics;

  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <MetricCard label={t("workflowBuilder.debugger.advanced.metrics.nodes")} value={String(metrics.nodeCount)} />
      <MetricCard label={t("workflowBuilder.debugger.advanced.metrics.branches")} value={String(metrics.branchCount)} />
      <MetricCard label={t("workflowBuilder.debugger.advanced.metrics.frames")} value={String(metrics.frameCount)} />
      <MetricCard label={t("workflowBuilder.debugger.advanced.metrics.variables")} value={String(metrics.variableCount)} />
      <MetricCard label={t("workflowBuilder.debugger.advanced.metrics.duration")} value={`${Math.round(metrics.replayDurationMs)}ms`} />
      <MetricCard label={t("workflowBuilder.debugger.advanced.metrics.memory")} value={`${Math.round(metrics.memoryEstimateBytes / 1024)}KB`} />
    </div>
  );
});

type DebugReportPanelProps = {
  model: DebuggerAdvancedViewModel;
};

export const DebugReportPanel = memo(function DebugReportPanel({ model }: DebugReportPanelProps) {
  const { t } = useTranslation("common");
  const report = model.report;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{t("workflowBuilder.debugger.advanced.report.readiness")}</span>
        <Badge variant={report.readinessScore >= 80 ? "default" : "secondary"}>{report.readinessScore}</Badge>
      </div>
      <ReportSection title={t("workflowBuilder.debugger.advanced.report.warnings")} items={report.warnings} />
      <ReportSection title={t("workflowBuilder.debugger.advanced.report.errors")} items={report.errors} />
      <ReportSection title={t("workflowBuilder.debugger.advanced.report.bottlenecks")} items={report.bottlenecks} />
      <ReportSection title={t("workflowBuilder.debugger.advanced.report.unusedBranches")} items={report.unusedBranches} />
    </div>
  );
});

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function ReportSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
