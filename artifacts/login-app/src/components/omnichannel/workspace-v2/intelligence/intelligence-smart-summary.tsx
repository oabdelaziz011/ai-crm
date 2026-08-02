import { memo } from "react";
import { FileText } from "lucide-react";
import { useIntelligenceContext } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-context";
import { EnterpriseCard, EnterpriseCardTitle } from "@/components/omnichannel/workspace-v2/intelligence/enterprise-card";
import { StatusPill } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-ui";

function SummaryBullet({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-1">
      <p className="text-[10px] leading-relaxed text-[var(--ws-text)]" dir="auto">
        <span className="text-[var(--ws-muted)]">• {label}:</span> {value}
      </p>
    </div>
  );
}

export const IntelligenceSmartSummary = memo(function IntelligenceSmartSummary() {
  const { viewModel, labels, dir } = useIntelligenceContext();
  const summary = viewModel.v2.smartSummary;
  const v2 = labels.v2;

  return (
    <EnterpriseCard accent="violet" className="transition-shadow hover:shadow-[0_6px_20px_rgba(0,0,0,0.16)]">
      <EnterpriseCardTitle icon={<FileText className="size-3.5 text-[var(--ws-violet)]" />}>
        {v2.smartSummaryTitle}
      </EnterpriseCardTitle>
      <div dir={dir}>
        <SummaryBullet label={v2.summaryRequestType} value={summary.requestType} />
        <SummaryBullet label={v2.summaryReason} value={summary.contactReason} />
        <SummaryBullet label={v2.summaryLastAction} value={summary.lastAction} />
        <div className="flex items-center gap-2 py-1">
          <span className="text-[10px] text-[var(--ws-muted)]">• {v2.summaryFollowUp}:</span>
          <StatusPill label={summary.followUpLabel} tone={summary.needsFollowUp ? "warning" : "healthy"} />
        </div>
        <SummaryBullet label={v2.summaryLastReply} value={summary.lastReply} />
      </div>
    </EnterpriseCard>
  );
});
