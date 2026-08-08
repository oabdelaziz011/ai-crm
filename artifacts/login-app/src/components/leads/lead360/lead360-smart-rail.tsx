import { useTranslation } from "react-i18next";
import type { LeadReadModel } from "@workspace/application-layer";
import type { Lead360AiPanelDto } from "@/lib/lead-intelligence/lead360-ai-types";
import { translateLeadStageLabel } from "@/components/leads/kanban/lead-stage-label";
import { AiCard, ScoreGauge, ProvenanceLine, pct } from "./lead360-ui";
import { cn } from "@/lib/utils";

export function Lead360SmartRail({
  lead,
  panel,
}: {
  lead: LeadReadModel;
  panel?: Lead360AiPanelDto | null;
}) {
  const { t } = useTranslation("common");
  const intel = panel?.intelligence;
  const score = intel?.score.overall.value ?? lead.score;
  const temperature = intel?.temperature.value ?? lead.temperature;
  const confidence = intel?.overallConfidence;
  const country = intel?.country.country.value;
  const market = intel?.country.market.value;
  const next = intel?.recommendations[0];
  const stageLabel = translateLeadStageLabel(t, {
    name: lead.stage,
    lifecycleStatus: lead.lifecycleStatus,
    slug: lead.stage,
  });

  return (
    <aside className="space-y-3.5" aria-label={t("leads360.smartRail")}>
      <div className="sticky top-0 max-h-[calc(92vh-180px)] space-y-3.5 overflow-y-auto pe-1">
        <AiCard title={t("leads360.ai.score")}>
          <ScoreGauge score={score} />
        </AiCard>

        {temperature ? (
          <AiCard title={t("leads360.ai.temperature")}>
            <p
              className={cn(
                "text-[16px] font-semibold tracking-tight",
                temperature === "hot" && "text-orange-600 dark:text-orange-300",
                temperature === "warm" && "text-amber-600 dark:text-amber-300",
                temperature === "cold" && "text-sky-600 dark:text-sky-300",
              )}
            >
              {t(`leads.scoreBand.${temperature}`)}
            </p>
            <ProvenanceLine
              confidence={intel?.temperature.confidence}
              source={intel?.temperature.source}
              updatedAt={intel?.analyzedAt}
            />
          </AiCard>
        ) : null}

        {confidence != null ? (
          <AiCard title={t("leads360.ai.confidence")}>
            <p className="text-[22px] font-semibold tabular-nums tracking-tight">{pct(confidence)}</p>
            <ProvenanceLine updatedAt={intel?.analyzedAt} source="pipeline" />
          </AiCard>
        ) : null}

        {country ? (
          <AiCard title={t("leads360.ai.country")}>
            <p className="text-[14px] font-semibold">{country}</p>
            <ProvenanceLine
              confidence={intel?.country.country.confidence}
              source={intel?.country.country.source}
              updatedAt={intel?.analyzedAt}
            />
          </AiCard>
        ) : null}

        {market ? (
          <AiCard title={t("leads360.ai.market")}>
            <p className="text-[14px] font-semibold">{market}</p>
            <ProvenanceLine
              confidence={intel?.country.market.confidence}
              source={intel?.country.market.source}
              updatedAt={intel?.analyzedAt}
            />
          </AiCard>
        ) : null}

        <AiCard title={t("leads.columns.owner")}>
          <p className="text-[14px] font-semibold leading-snug">{lead.owner || "—"}</p>
        </AiCard>

        <AiCard title={t("leads.columns.stage")}>
          <p className="text-[14px] font-semibold leading-snug">{stageLabel}</p>
        </AiCard>

        {next ? (
          <AiCard title={t("leads360.ai.nextAction")}>
            <p className="text-[14px] font-semibold leading-snug">{next.action}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{next.reason}</p>
            <ProvenanceLine
              confidence={next.confidence}
              source={next.source}
              updatedAt={intel?.analyzedAt}
            />
          </AiCard>
        ) : null}
      </div>
    </aside>
  );
}
