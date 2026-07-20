import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import { useAIExecutionServices } from "@/lib/ai-execution-engine";

export function AiRuntimeMonitorPage() {
  const { t } = useTranslation("common");
  const { services } = useAIExecutionServices();
  const summary = services.observability.summary();
  const sessions = services.enterpriseRuntime?.listSessions() ?? services.sessions.list();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("aiRuntime.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("aiRuntime.subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <DashboardCard className="p-4">
          <p className="text-sm text-muted-foreground">{t("aiRuntime.metrics.events")}</p>
          <p className="text-2xl font-semibold">{summary.eventCount}</p>
        </DashboardCard>
        <DashboardCard className="p-4">
          <p className="text-sm text-muted-foreground">{t("aiRuntime.metrics.cacheHitRatio")}</p>
          <p className="text-2xl font-semibold">{(summary.cacheHitRatio * 100).toFixed(1)}%</p>
        </DashboardCard>
        <DashboardCard className="p-4">
          <p className="text-sm text-muted-foreground">{t("aiRuntime.metrics.sessions")}</p>
          <p className="text-2xl font-semibold">{sessions.length}</p>
        </DashboardCard>
      </div>

      <DashboardCard className="p-4 space-y-3">
        <h2 className="font-semibold">{t("aiRuntime.sessions.title")}</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("aiRuntime.sessions.empty")}</p>
        ) : (
          <div className="space-y-2">
            {sessions.slice(0, 20).map((session) => (
              <div key={session.sessionId} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap gap-3">
                  <span>{session.executionId}</span>
                  <span>{session.providerKey}</span>
                  <span>{session.model}</span>
                  <span>{session.status}</span>
                  <span>{session.latencyMs}ms</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>
    </div>
  );
}

export default AiRuntimeMonitorPage;
