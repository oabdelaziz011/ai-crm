import { memo } from "react";
import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import type { AiEmployeeRuntimeStatusSnapshot } from "@/lib/ai-employees/types";

const PRESENCE_VARIANT: Record<AiEmployeeRuntimeStatusSnapshot["presence"], "default" | "secondary" | "outline" | "destructive"> = {
  online: "default",
  idle: "secondary",
  busy: "default",
  waiting: "outline",
  offline: "destructive",
};

type RuntimeStatusCardProps = {
  status: AiEmployeeRuntimeStatusSnapshot | null;
  isLoading?: boolean;
};

export const RuntimeStatusCard = memo(function RuntimeStatusCard({ status, isLoading }: RuntimeStatusCardProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="space-y-4 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t("aiEmployees.operations.runtimeStatus.title")}
      </h2>
      {isLoading || !status ? (
        <p className="text-sm text-muted-foreground">{t("aiEmployees.operations.loading")}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={PRESENCE_VARIANT[status.presence]}>
              {t(`aiEmployees.operations.runtimeStatus.presence.${status.presence}`)}
            </Badge>
            {status.isPaused ? (
              <Badge variant="outline">{t("aiEmployees.operations.runtimeStatus.paused")}</Badge>
            ) : null}
          </div>
          <dl className="grid gap-2 text-sm">
            <Row label={t("aiEmployees.operations.runtimeStatus.lastHeartbeat")} value={formatTime(status.lastHeartbeat)} />
            <Row
              label={t("aiEmployees.operations.runtimeStatus.currentExecution")}
              value={status.currentExecutionLabel ?? "—"}
            />
            <Row label={t("aiEmployees.operations.runtimeStatus.queueLength")} value={String(status.queueLength)} />
          </dl>
        </div>
      )}
    </DashboardCard>
  );
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}
