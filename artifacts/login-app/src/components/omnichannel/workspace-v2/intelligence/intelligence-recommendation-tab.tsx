import { memo } from "react";
import { Check, Lightbulb } from "lucide-react";
import { useIntelligenceContext } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-context";
import { EnterpriseCard, EnterpriseCardTitle } from "@/components/omnichannel/workspace-v2/intelligence/enterprise-card";
import { ConfidenceBar } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-ui";

export const IntelligenceRecommendationTab = memo(function IntelligenceRecommendationTab() {
  const { viewModel, panelLabels: labels, labels: sidebarLabels, dir } = useIntelligenceContext();
  const checklist = viewModel.v2.checklist;
  const v2 = sidebarLabels.v2;

  if (checklist.length === 0) {
    return (
      <p className="py-8 text-center text-[10px] text-[var(--ws-muted)]" dir={dir}>
        {labels.empty}
      </p>
    );
  }

  return (
    <div className="space-y-3" dir={dir}>
      <EnterpriseCard accent="accent" className="p-3 transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <EnterpriseCardTitle icon={<Lightbulb className="size-3.5 text-[var(--ws-accent)]" />}>
          {v2.checklistTitle}
        </EnterpriseCardTitle>
        <ul className="space-y-2">
          {checklist.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-[var(--ws-border-subtle)] bg-[var(--ws-surface)] px-3 py-2 transition-colors hover:border-[var(--ws-accent)]/25"
            >
              <div className="mb-1.5 flex items-start gap-2">
                <span
                  className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${
                    item.suggested
                      ? "border-[hsl(var(--success)/0.5)] bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]"
                      : "border-[var(--ws-border-subtle)] text-[var(--ws-muted)]"
                  }`}
                >
                  {item.suggested ? <Check className="size-2.5" /> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium" dir="auto">
                      {item.label}
                    </p>
                    <span className="shrink-0 text-[9px] tabular-nums text-[var(--ws-muted)]">
                      {labels.confidence.replace("{{percent}}", String(item.confidence))}
                    </span>
                  </div>
                  <ConfidenceBar value={item.confidence} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </EnterpriseCard>
    </div>
  );
});
