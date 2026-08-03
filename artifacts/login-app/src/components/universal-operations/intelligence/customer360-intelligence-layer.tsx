import { memo } from "react";
import type { IntelligenceBlockId, IntelligenceSnapshot } from "@workspace/universal-operations-engine";
import { IntelligenceContextRibbon, IntelligenceQuickDecisionBar } from "./intelligence-ribbon";
import { IntelligenceOperationalHealth, IntelligenceAlerts, IntelligenceWorkflowTracker } from "./intelligence-health-alerts";
import { IntelligenceRecommendations, IntelligenceMiniKpis } from "./intelligence-recommendations";
import { IntelligenceBusinessContext } from "./intelligence-context-feed";
import { IntelligenceFloatingCopilot } from "./intelligence-floating-copilot";
import { useTranslation } from "react-i18next";

function IntelligenceBlock({
  blockId,
  snapshot,
}: {
  blockId: IntelligenceBlockId;
  snapshot: IntelligenceSnapshot;
}) {
  const { t } = useTranslation("common");

  switch (blockId) {
    case "context_ribbon":
      return <IntelligenceContextRibbon steps={snapshot.journey} />;
    case "quick_decision_bar":
      return (
        <IntelligenceQuickDecisionBar
          outstandingCents={snapshot.quickDecision.outstandingPaymentCents}
          status={snapshot.quickDecision.currentStatus}
          employee={snapshot.quickDecision.assignedEmployee}
          room={snapshot.quickDecision.room}
          priority={snapshot.quickDecision.priority}
          risk={snapshot.quickDecision.risk}
          nextAction={snapshot.quickDecision.nextAction}
        />
      );
    case "operational_intelligence":
      return (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t("intelligence.operationalHealth")}</p>
          <IntelligenceOperationalHealth metrics={snapshot.operationalHealth} />
        </div>
      );
    case "alerts":
      return snapshot.alerts.length > 0 ? (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t("intelligence.alerts")}</p>
          <IntelligenceAlerts alerts={snapshot.alerts} />
        </div>
      ) : null;
    case "recommendations":
      return <IntelligenceRecommendations recommendations={snapshot.recommendations} />;
    case "workflow_tracker":
      return (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t("intelligence.workflow")}</p>
          <IntelligenceWorkflowTracker stages={snapshot.workflow} />
        </div>
      );
    case "mini_kpis":
      return (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t("intelligence.miniKpis")}</p>
          <IntelligenceMiniKpis kpis={snapshot.miniKpis} />
        </div>
      );
    case "business_context":
      return <IntelligenceBusinessContext fields={snapshot.businessContext} />;
    case "floating_copilot":
      return null;
    default:
      return null;
  }
}

export const Customer360IntelligenceLayer = memo(function Customer360IntelligenceLayer({
  snapshot,
  blockIds,
  showCopilot,
}: {
  snapshot: IntelligenceSnapshot;
  blockIds: IntelligenceBlockId[];
  showCopilot: boolean;
}) {
  const inlineBlocks = blockIds.filter((id) => id !== "floating_copilot");

  return (
    <>
      <div className="space-y-4">
        {inlineBlocks.map((blockId) => (
          <IntelligenceBlock key={blockId} blockId={blockId} snapshot={snapshot} />
        ))}
      </div>
      {showCopilot && <IntelligenceFloatingCopilot capabilities={snapshot.copilotCapabilities} />}
    </>
  );
});
