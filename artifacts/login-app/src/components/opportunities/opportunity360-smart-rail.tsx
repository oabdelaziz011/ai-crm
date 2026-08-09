import { useTranslation } from "react-i18next";
import type { OpportunityReadModel, QuoteReadModel } from "@workspace/application-layer";
import {
  resolveOpportunityStageLabel,
  useOpportunityPipelineContext,
} from "@/hooks/opportunities/use-opportunity-pipeline";
import {
  emptyDisplayValue,
  formatOpportunityDate,
  formatOpportunityMoney,
} from "./opportunity360-ui";

export type Opportunity360SmartRailProps = {
  opportunity: OpportunityReadModel;
  productsCount: number | null;
  currentQuote: QuoteReadModel | null;
  locale: string;
  pipelineName?: string | null;
  compact?: boolean;
  onOpenQuote?: () => void;
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[60%] truncate text-end font-medium text-foreground">{value}</dd>
    </div>
  );
}

export function Opportunity360SmartRail({
  opportunity,
  productsCount,
  currentQuote,
  locale,
  pipelineName,
  compact = false,
  onOpenQuote,
}: Opportunity360SmartRailProps) {
  const { t } = useTranslation("common");
  const empty = emptyDisplayValue(t);
  const pipelineContext = useOpportunityPipelineContext(opportunity.pipelineId);
  const stageLabel =
    resolveOpportunityStageLabel(
      pipelineContext.stageById,
      opportunity.stageId,
      opportunity.stage,
    ) || empty;
  const revenue =
    formatOpportunityMoney(opportunity.expectedRevenue, opportunity.currency) || empty;
  const closeDate = formatOpportunityDate(opportunity.expectedCloseDate, locale) || empty;
  const quoteLabel = currentQuote
    ? `${currentQuote.quoteNumber} · ${currentQuote.title}`.trim()
    : empty;
  const productsLabel =
    productsCount == null
      ? empty
      : t("opportunities360.nav.productsCount", { count: productsCount });

  if (compact) {
    return (
      <div
        className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={t("opportunities360.summary")}
      >
        {[
          [t("opportunities360.fields.amount"), revenue],
          [t("opportunities360.fields.stage"), stageLabel],
          [t("opportunities360.fields.expectedCloseDate"), closeDate],
        ].map(([label, value]) => (
          <div
            key={label}
            className="min-w-[120px] shrink-0 rounded-lg border border-border/40 bg-muted/20 px-3 py-2"
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-0.5 truncate text-[13px] font-semibold">{value}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <aside className="space-y-4" aria-label={t("opportunities360.smartRail")}>
      <section className="rounded-xl border border-border/40 bg-muted/10 p-4">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("opportunities360.summary")}
        </h3>
        <dl className="space-y-2.5">
          <SummaryRow label={t("opportunities360.fields.amount")} value={revenue} />
          <SummaryRow
            label={t("opportunities360.fields.currency")}
            value={opportunity.currency?.trim().toUpperCase() || empty}
          />
          <SummaryRow
            label={t("opportunities360.fields.probability")}
            value={`${opportunity.probabilityPercent}%`}
          />
          <SummaryRow label={t("opportunities360.fields.expectedCloseDate")} value={closeDate} />
          <SummaryRow
            label={t("opportunities360.fields.pipeline")}
            value={pipelineName?.trim() || empty}
          />
          <SummaryRow label={t("opportunities360.fields.stage")} value={stageLabel} />
          <SummaryRow
            label={t("opportunities360.fields.owner")}
            value={opportunity.owner?.trim() || empty}
          />
          <SummaryRow label={t("opportunities360.fields.productsCount")} value={productsLabel} />
        </dl>
      </section>

      <section className="rounded-xl border border-border/40 bg-muted/10 p-4">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("opportunities360.fields.currentQuote")}
        </h3>
        {onOpenQuote && currentQuote ? (
          <button
            type="button"
            onClick={onOpenQuote}
            className="text-start text-[13px] font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("opportunities360.nav.openQuote", { name: quoteLabel })}
          >
            {quoteLabel}
          </button>
        ) : (
          <p className="text-[13px] font-medium">{quoteLabel}</p>
        )}
      </section>
    </aside>
  );
}
