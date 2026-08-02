import { memo } from "react";
import { Activity } from "lucide-react";
import { useIntelligenceContext } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-context";
import { EnterpriseCard, EnterpriseCardTitle, EnterpriseMetric } from "@/components/omnichannel/workspace-v2/intelligence/enterprise-card";
import {
  MiniSparkline,
  ProgressRing,
  scoreColorClass,
  StatusPill,
} from "@/components/omnichannel/workspace-v2/intelligence/intelligence-ui";

function FlagMetric({ label, value, yes, no }: { label: string; value: boolean; yes: string; no: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-[10px]">
      <span className="text-[var(--ws-muted)]" dir="auto">{label}</span>
      <StatusPill label={value ? yes : no} tone={value ? "warning" : "healthy"} />
    </div>
  );
}

export const IntelligenceHealthTab = memo(function IntelligenceHealthTab() {
  const { viewModel, panelLabels, labels: sidebarLabels, dir } = useIntelligenceContext();
  const dashboard = viewModel.v2.healthDashboard;
  const v2 = sidebarLabels.v2;
  const statusTone =
    dashboard.status === "critical"
      ? "critical"
      : dashboard.status === "warning"
        ? "warning"
        : "healthy";

  const statusLabel =
    dashboard.status === "healthy"
      ? panelLabels.healthHealthy
      : dashboard.status === "warning"
        ? panelLabels.healthWarning
        : panelLabels.healthCritical;

  return (
    <div className="space-y-3" dir={dir}>
      <EnterpriseCard accent={dashboard.status === "critical" ? "warn" : "default"} className="p-4">
        <EnterpriseCardTitle icon={<Activity className="size-3.5 text-[var(--ws-accent)]" />}>
          {v2.healthScoreTitle}
        </EnterpriseCardTitle>
        <div className="flex items-center gap-4">
          <ProgressRing value={dashboard.score} size={64} className={scoreColorClass(dashboard.score)}>
            <span className={`text-lg font-bold tabular-nums ${scoreColorClass(dashboard.score)}`}>{dashboard.score}</span>
          </ProgressRing>
          <StatusPill label={statusLabel} tone={statusTone} />
        </div>
        <MiniSparkline
          values={[
            dashboard.score - 12,
            dashboard.score - 6,
            dashboard.score - 2,
            dashboard.score,
          ].map((v) => Math.max(8, v))}
          className="mt-3"
        />
      </EnterpriseCard>

      <EnterpriseCard>
        <EnterpriseCardTitle>{panelLabels.healthTitle}</EnterpriseCardTitle>
        <EnterpriseMetric label={panelLabels.healthSla} value={dashboard.sla} />
        <EnterpriseMetric label={panelLabels.healthTransfers} value={String(dashboard.transfers)} />
        <EnterpriseMetric label={panelLabels.healthEscalations} value={String(dashboard.escalations)} />
      </EnterpriseCard>

      <EnterpriseCard>
        <FlagMetric label={v2.healthHasTicket} value={dashboard.hasTicket} yes={v2.yes} no={v2.no} />
        <FlagMetric label={v2.healthHasCrm} value={dashboard.hasCrm} yes={v2.yes} no={v2.no} />
        <FlagMetric label={v2.healthHasNotes} value={dashboard.hasInternalNotes} yes={v2.yes} no={v2.no} />
        <FlagMetric label={v2.healthNewCustomer} value={dashboard.isNewCustomer} yes={v2.yes} no={v2.no} />
        <FlagMetric label={v2.healthVip} value={dashboard.isVip} yes={v2.yes} no={v2.no} />
      </EnterpriseCard>
    </div>
  );
});
