import { memo } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Clock3,
  Coins,
  Gauge,
  ListOrdered,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardStatCard } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  AiEmployeeOperationsControlAction,
  AiEmployeeOperationsSnapshot,
  AiEmployeeRecord,
} from "@/lib/ai-employees/types";
import { RuntimeStatusCard } from "./runtime-status-card";

type OperationsCenterPanelProps = {
  employee: AiEmployeeRecord;
  snapshot: AiEmployeeOperationsSnapshot | null;
  isLoading: boolean;
  canControl: boolean;
  isControlling: boolean;
  onControl: (action: AiEmployeeOperationsControlAction) => Promise<void>;
};

export const OperationsCenterPanel = memo(function OperationsCenterPanel({
  employee,
  snapshot,
  isLoading,
  canControl,
  isControlling,
  onControl,
}: OperationsCenterPanelProps) {
  const { t } = useTranslation("common");

  return (
    <section className="space-y-4">
      <DashboardCard className="space-y-4 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("aiEmployees.operations.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("aiEmployees.operations.subtitle")}</p>
          </div>
          {canControl ? (
            <div className="flex flex-wrap gap-2">
              <ControlButton
                icon={Pause}
                label={t("aiEmployees.operations.controls.pause")}
                disabled={isControlling || employee.status === "disabled"}
                onClick={() => void onControl("pause")}
              />
              <ControlButton
                icon={Play}
                label={t("aiEmployees.operations.controls.resume")}
                disabled={isControlling || employee.status !== "disabled"}
                onClick={() => void onControl("resume")}
              />
              <ControlButton
                icon={RotateCcw}
                label={t("aiEmployees.operations.controls.disable")}
                disabled={isControlling || employee.status === "disabled" || employee.status === "archived"}
                onClick={() => void onControl("disable")}
              />
              <ControlButton
                icon={RefreshCw}
                label={t("aiEmployees.operations.controls.restart")}
                disabled={isControlling || !employee.currentVersionNumber}
                onClick={() => void onControl("restart")}
              />
            </div>
          ) : null}
        </div>
      </DashboardCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          label={t("aiEmployees.operations.metrics.executionsToday")}
          value={snapshot?.metrics.executionsToday ?? "—"}
          icon={Activity}
        />
        <DashboardStatCard
          label={t("aiEmployees.operations.metrics.successRate")}
          value={snapshot ? `${snapshot.metrics.successRate}%` : "—"}
          icon={Gauge}
        />
        <DashboardStatCard
          label={t("aiEmployees.operations.costs.daily")}
          value={snapshot ? formatCost(snapshot.costs.estimatedDailyCost, snapshot.costs.currency) : "—"}
          icon={Coins}
        />
        <DashboardStatCard
          label={t("aiEmployees.operations.queue.running")}
          value={snapshot?.queue.running ?? "—"}
          icon={ListOrdered}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <RuntimeStatusCard status={snapshot?.runtimeStatus ?? null} isLoading={isLoading} />

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={ListOrdered} title={t("aiEmployees.operations.queue.title")} />
          {snapshot ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <QueueStat label={t("aiEmployees.operations.queue.pending")} value={snapshot.queue.pending} />
              <QueueStat label={t("aiEmployees.operations.queue.running")} value={snapshot.queue.running} />
              <QueueStat label={t("aiEmployees.operations.queue.completed")} value={snapshot.queue.completed} />
              <QueueStat label={t("aiEmployees.operations.queue.failed")} value={snapshot.queue.failed} />
            </div>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Activity} title={t("aiEmployees.operations.running.title")} />
          {snapshot && snapshot.runningExecutions.length > 0 ? (
            <ul className="space-y-3">
              {snapshot.runningExecutions.map((execution) => (
                <li key={execution.id} className="rounded-2xl border border-border/60 bg-background/60 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{execution.workflowLabel}</span>
                    <Badge variant="outline">{execution.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {execution.id.slice(0, 8)} · {formatDuration(execution.durationMs)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.operations.running.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Wrench} title={t("aiEmployees.operations.tools.title")} />
          {snapshot && snapshot.toolLogs.length > 0 ? (
            <ul className="space-y-3">
              {snapshot.toolLogs.slice(0, 8).map((entry) => (
                <li key={entry.id} className="rounded-2xl border border-border/60 bg-background/60 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{entry.toolKey}</span>
                    <Badge variant={entry.status === "failed" ? "destructive" : "outline"}>{entry.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDuration(entry.durationMs)} · {new Date(entry.startedAt).toLocaleString()}
                  </p>
                  {entry.errorMessage ? (
                    <p className="mt-1 text-xs text-destructive">{entry.errorMessage}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.operations.tools.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={BookOpen} title={t("aiEmployees.operations.knowledge.title")} />
          {snapshot ? (
            <dl className="grid gap-2 text-sm">
              <MetricRow label={t("aiEmployees.operations.knowledge.retrievalCount")} value={snapshot.knowledgeUsage.retrievalCount} />
              <MetricRow label={t("aiEmployees.operations.knowledge.documentsUsed")} value={snapshot.knowledgeUsage.documentsUsed} />
              <MetricRow
                label={t("aiEmployees.operations.knowledge.averageConfidence")}
                value={snapshot.knowledgeUsage.averageConfidence?.toFixed(2) ?? "—"}
              />
              <MetricRow
                label={t("aiEmployees.operations.knowledge.averageDuration")}
                value={formatDuration(snapshot.knowledgeUsage.averageDurationMs)}
              />
              <MetricRow
                label={t("aiEmployees.operations.knowledge.successRate")}
                value={`${snapshot.knowledgeUsage.successRate}%`}
              />
            </dl>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Gauge} title={t("aiEmployees.operations.metrics.title")} />
          {snapshot ? (
            <dl className="grid gap-2 text-sm">
              <MetricRow label={t("aiEmployees.operations.metrics.executionsToday")} value={snapshot.metrics.executionsToday} />
              <MetricRow label={t("aiEmployees.operations.metrics.successRate")} value={`${snapshot.metrics.successRate}%`} />
              <MetricRow
                label={t("aiEmployees.operations.metrics.averageRuntime")}
                value={formatDuration(snapshot.metrics.averageRuntimeMs)}
              />
              <MetricRow
                label={t("aiEmployees.operations.metrics.averageQueueTime")}
                value={formatDuration(snapshot.metrics.averageQueueTimeMs)}
              />
              <MetricRow label={t("aiEmployees.operations.metrics.retryCount")} value={snapshot.metrics.retryCount} />
              <MetricRow label={t("aiEmployees.operations.metrics.timeoutCount")} value={snapshot.metrics.timeoutCount} />
            </dl>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={AlertTriangle} title={t("aiEmployees.operations.errors.title")} />
          {snapshot && snapshot.errors.length > 0 ? (
            <ul className="space-y-3">
              {snapshot.errors.slice(0, 8).map((error) => (
                <li key={error.id} className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize">{error.category}</span>
                    <span className="text-xs text-muted-foreground">{new Date(error.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{error.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.operations.errors.empty")} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5">
          <SectionTitle icon={Coins} title={t("aiEmployees.operations.costs.title")} />
          {snapshot ? (
            <dl className="grid gap-2 text-sm">
              <MetricRow label={t("aiEmployees.operations.costs.requests")} value={snapshot.costs.requests} />
              <MetricRow label={t("aiEmployees.operations.costs.promptTokens")} value={snapshot.costs.promptTokens} />
              <MetricRow label={t("aiEmployees.operations.costs.completionTokens")} value={snapshot.costs.completionTokens} />
              <MetricRow
                label={t("aiEmployees.operations.costs.daily")}
                value={formatCost(snapshot.costs.estimatedDailyCost, snapshot.costs.currency)}
              />
              <MetricRow
                label={t("aiEmployees.operations.costs.monthly")}
                value={formatCost(snapshot.costs.estimatedMonthlyCost, snapshot.costs.currency)}
              />
            </dl>
          ) : (
            <EmptyState loading={isLoading} />
          )}
        </DashboardCard>

        <DashboardCard className="space-y-4 p-5 xl:col-span-2">
          <SectionTitle icon={Clock3} title={t("aiEmployees.operations.timeline.title")} />
          {snapshot && snapshot.timeline.length > 0 ? (
            <ol className="space-y-3">
              {snapshot.timeline.slice(0, 12).map((event) => (
                <li key={event.id} className="rounded-2xl border border-border/60 bg-background/60 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {t(`aiEmployees.operations.timeline.events.${event.eventType}`, {
                        defaultValue: event.label,
                      })}
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleString()}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState loading={isLoading} message={t("aiEmployees.operations.timeline.empty")} />
          )}
        </DashboardCard>
      </div>
    </section>
  );
});

function SectionTitle({ icon: Icon, title }: { icon: typeof Activity; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 text-primary" />
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
    </div>
  );
}

function QueueStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function ControlButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: typeof Pause;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={disabled} onClick={onClick}>
      <Icon className="me-2 size-4" />
      {label}
    </Button>
  );
}

function EmptyState({ loading, message }: { loading?: boolean; message?: string }) {
  const { t } = useTranslation("common");
  return (
    <p className="text-sm text-muted-foreground">
      {loading ? t("aiEmployees.operations.loading") : message ?? t("aiEmployees.operations.empty")}
    </p>
  );
}

function formatDuration(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function formatCost(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 4 }).format(value);
}
