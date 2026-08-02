import { memo } from "react";
import { IntelligenceSmartSummary } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-smart-summary";
import { IntelligenceKpiStrip } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-kpi-strip";

export const IntelligenceSummaryTab = memo(function IntelligenceSummaryTab() {
  return (
    <div className="space-y-1.5">
      <IntelligenceSmartSummary />
      <IntelligenceKpiStrip />
    </div>
  );
});
