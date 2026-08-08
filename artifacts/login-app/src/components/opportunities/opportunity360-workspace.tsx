import { Briefcase, Loader2, TrendingUp, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { OpportunityHistoryReadModel, OpportunityReadModel } from "@workspace/application-layer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { OpportunityProductsPanel } from "@/components/products/product360-workspace";
import {
  OpportunityQuotesPanel,
  Quote360Workspace,
} from "@/components/quotes/quote360-workspace";
import {
  useOpportunityPipelineBoard,
  useOpportunityPipelines,
  useOpportunityWorkspace,
} from "@/hooks/opportunities/use-opportunity-commands";
import { formatBillingCurrency } from "@/lib/billing/format";
import { cn } from "@/lib/utils";

/** Company Settings currency (not per-record hardcoded codes). */
function money(value: number | null, _currency?: string) {
  return formatBillingCurrency(value);
}

function OpportunityHeader({
  opportunity,
  onClose,
}: {
  opportunity: OpportunityReadModel;
  onClose: () => void;
}) {
  const { t } = useTranslation("common");
  return (
    <header className="shrink-0 border-b border-border/60 bg-gradient-to-b from-muted/30 to-transparent px-5 py-4 sm:px-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="truncate text-[1.35rem] font-semibold tracking-[-0.03em]">
              {opportunity.name}
            </h2>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[12px] font-semibold">
              {opportunity.stage}
            </span>
          </div>
          <p className="mt-1.5 truncate text-[13px] text-muted-foreground">
            {[opportunity.companyName, opportunity.primaryContact, opportunity.owner]
              .filter(Boolean)
              .join(" · ") || t("opportunities.empty.company", { defaultValue: "No company linked" })}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-[13px]">
            <span className="font-semibold tabular-nums">
              {money(opportunity.expectedRevenue, opportunity.currency)}
            </span>
            <span className="text-muted-foreground">
              {t("opportunities.probability", { defaultValue: "Probability" })} ·{" "}
              {opportunity.probabilityPercent}%
            </span>
            <span className="text-muted-foreground">
              {t("opportunities.weighted", { defaultValue: "Weighted" })} ·{" "}
              {money(opportunity.weightedRevenue, opportunity.currency)}
            </span>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </div>
    </header>
  );
}

function AiContextPanel({ opportunity }: { opportunity: OpportunityReadModel }) {
  const { t } = useTranslation("common");
  const snap = opportunity.aiContextSnapshot as Record<string, unknown>;
  const summary = typeof snap.leadSummary === "string" ? snap.leadSummary : "";
  const buying = Array.isArray(snap.buyingSignals) ? snap.buyingSignals : [];
  const risk = Array.isArray(snap.riskSignals) ? snap.riskSignals : [];
  const recommendations = Array.isArray(snap.recommendations) ? snap.recommendations : [];

  if (!summary && buying.length === 0 && risk.length === 0 && !opportunity.leadId) {
    return (
      <EnterpriseEmptyState
        icon={<TrendingUp className="size-6" aria-hidden />}
        title={t("opportunities.ai.emptyTitle", { defaultValue: "No AI context yet" })}
        description={t("opportunities.ai.emptyBody", {
          defaultValue: "Create this opportunity from a qualified lead to carry Lead Intelligence.",
        })}
      />
    );
  }

  return (
    <div className="space-y-4">
      {summary ? (
        <section className="rounded-lg border border-border/60 bg-muted/20 p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("opportunities.ai.leadSummary", { defaultValue: "Lead Summary" })}
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed">{summary}</p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Source · lead · Confidence · snapshot · Updated · creation
          </p>
        </section>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-lg border border-border/60 p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("opportunities.ai.buying", { defaultValue: "Buying Signals" })}
          </h3>
          <ul className="mt-2 space-y-1 text-[13px]">
            {buying.length ? (
              buying.slice(0, 8).map((s, i) => (
                <li key={i}>{typeof s === "object" && s && "type" in s ? String((s as { type: unknown }).type) : String(s)}</li>
              ))
            ) : (
              <li className="text-muted-foreground">—</li>
            )}
          </ul>
        </section>
        <section className="rounded-lg border border-border/60 p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("opportunities.ai.risk", { defaultValue: "Risk Signals" })}
          </h3>
          <ul className="mt-2 space-y-1 text-[13px]">
            {risk.length ? (
              risk.slice(0, 8).map((s, i) => (
                <li key={i}>{typeof s === "object" && s && "type" in s ? String((s as { type: unknown }).type) : String(s)}</li>
              ))
            ) : (
              <li className="text-muted-foreground">—</li>
            )}
          </ul>
        </section>
      </div>

      {recommendations[0] && typeof recommendations[0] === "object" ? (
        <section className="rounded-lg border border-border/60 p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("opportunities.ai.recommendation", { defaultValue: "AI Recommendation" })}
          </h3>
          <p className="mt-2 text-[14px] font-medium">
            {String((recommendations[0] as { action?: unknown }).action ?? "")}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {String((recommendations[0] as { reason?: unknown }).reason ?? "")}
          </p>
        </section>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        {t("opportunities.ai.readOnlyHint", {
          defaultValue:
            "AI context is read-only from the source Lead. Conversations stay on Lead / Omnichannel.",
        })}
        {opportunity.leadId ? ` · Lead ${opportunity.leadId.slice(0, 8)}` : null}
      </p>
    </div>
  );
}

function TimelinePanel({ history }: { history: readonly OpportunityHistoryReadModel[] }) {
  const { t } = useTranslation("common");
  if (!history.length) {
    return (
      <EnterpriseEmptyState
        icon={<Briefcase className="size-6" aria-hidden />}
        title={t("opportunities.timeline.emptyTitle", { defaultValue: "No timeline events yet" })}
        description={t("opportunities.timeline.emptyBody", {
          defaultValue: "Stage changes, probability updates, and wins appear here.",
        })}
      />
    );
  }
  return (
    <ol className="space-y-3 border-s border-border/60 ps-4">
      {history.map((item) => (
        <li key={item.id} className="relative">
          <span className="absolute -start-[1.3rem] top-1.5 size-2 rounded-full bg-foreground/70" />
          <div className="text-[13px] font-medium">{item.summary || item.eventType}</div>
          <div className="text-[11px] text-muted-foreground">
            {new Date(item.createdAt).toLocaleString()} · {item.eventType}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Opportunity360Workspace({
  opportunityId,
  open,
  onOpenChange,
}: {
  opportunityId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("common");
  const { data, isLoading, isError, refetch } = useOpportunityWorkspace(opportunityId);
  const opportunity = data?.opportunity ?? null;
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[min(90vh,920px)] w-[min(1280px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0",
        )}
      >
        {isLoading ? (
          <div className="space-y-4 p-6" aria-busy="true">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : isError || !opportunity ? (
          <div className="p-6">
            <EnterpriseEmptyState
              icon={<Briefcase className="size-6" aria-hidden />}
              title={t("opportunities.loadError", { defaultValue: "Could not load opportunity" })}
              description={t("opportunities.loadErrorBody", {
                defaultValue: "Check your connection and try again.",
              })}
              primaryAction={{
                label: t("common.retry", { defaultValue: "Retry" }),
                onClick: () => void refetch(),
              }}
            />
          </div>
        ) : (
          <>
            <OpportunityHeader opportunity={opportunity} onClose={() => onOpenChange(false)} />
            <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="mx-5 mt-3 h-auto w-auto flex-wrap justify-start gap-1 bg-transparent p-0 sm:mx-7">
                {[
                  ["overview", "Overview"],
                  ["timeline", "Timeline"],
                  ["activities", "Activities"],
                  ["tasks", "Tasks"],
                  ["files", "Files"],
                  ["products", "Products"],
                  ["quotes", "Quotes"],
                  ["ai", "AI"],
                  ["audit", "Audit"],
                ].map(([value, label]) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="rounded-md px-3 py-1.5 text-[12px] data-[state=active]:bg-muted"
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7">
                <TabsContent value="overview" className="mt-0 space-y-4">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-[11px] uppercase text-muted-foreground">Stage</dt>
                      <dd className="text-[14px] font-medium">{opportunity.stage}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase text-muted-foreground">Owner</dt>
                      <dd className="text-[14px] font-medium">{opportunity.owner ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase text-muted-foreground">Country / Market</dt>
                      <dd className="text-[14px] font-medium">
                        {[opportunity.country, opportunity.market].filter(Boolean).join(" · ") || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase text-muted-foreground">Close date</dt>
                      <dd className="text-[14px] font-medium">{opportunity.expectedCloseDate ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase text-muted-foreground">Probability model</dt>
                      <dd className="text-[14px] font-medium">
                        {opportunity.probabilityPercent}% · {opportunity.probabilitySource}
                        {opportunity.probabilityReason ? ` · ${opportunity.probabilityReason}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase text-muted-foreground">Source lead</dt>
                      <dd className="text-[14px] font-medium">
                        {opportunity.createdFromLead && opportunity.leadId
                          ? opportunity.leadId.slice(0, 8)
                          : "Manual"}
                      </dd>
                    </div>
                  </dl>
                </TabsContent>

                <TabsContent value="timeline" className="mt-0">
                  <TimelinePanel history={data?.history ?? []} />
                </TabsContent>

                {(["activities", "tasks", "files"] as const).map((tab) => (
                  <TabsContent key={tab} value={tab} className="mt-0">
                    <EnterpriseEmptyState
                      icon={<Briefcase className="size-6" aria-hidden />}
                      title={t(`opportunities.${tab}.emptyTitle`, {
                        defaultValue: `No ${tab} yet`,
                      })}
                      description={t(`opportunities.${tab}.emptyBody`, {
                        defaultValue: "Coming in a later sales execution sprint.",
                      })}
                    />
                  </TabsContent>
                ))}

                <TabsContent value="products" className="mt-0">
                  <OpportunityProductsPanel
                    opportunityId={opportunity.id}
                    country={opportunity.country}
                    market={opportunity.market}
                  />
                </TabsContent>

                <TabsContent value="quotes" className="mt-0">
                  <OpportunityQuotesPanel
                    opportunityId={opportunity.id}
                    onOpenQuote={(id) => {
                      setQuoteId(id);
                      setQuoteOpen(true);
                    }}
                  />
                </TabsContent>

                <TabsContent value="ai" className="mt-0">
                  <AiContextPanel opportunity={opportunity} />
                </TabsContent>

                <TabsContent value="audit" className="mt-0">
                  <TimelinePanel history={data?.history ?? []} />
                </TabsContent>
              </div>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
    <Quote360Workspace
      quoteId={quoteId}
      open={quoteOpen}
      onOpenChange={setQuoteOpen}
      onVersionCreated={(id) => setQuoteId(id)}
    />
    </>
  );
}

export function OpportunityPipelineBoard({
  onSelect,
}: {
  onSelect: (opportunityId: string) => void;
}) {
  const { t } = useTranslation("common");
  const pipelines = useOpportunityPipelines();
  const defaultPipelineId = pipelines.data?.find((p) => p.isDefault)?.id ?? pipelines.data?.[0]?.id ?? null;
  const board = useOpportunityPipelineBoard(defaultPipelineId);

  if (pipelines.isLoading || board.isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("common.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  if (!board.data?.stages.length) {
    return (
      <EnterpriseEmptyState
        icon={<Briefcase className="size-6" aria-hidden />}
        title={t("opportunities.pipeline.emptyTitle", { defaultValue: "No opportunities yet" })}
        description={t("opportunities.pipeline.emptyBody", {
          defaultValue: "Create an opportunity from a qualified lead to start the revenue pipeline.",
        })}
      />
    );
  }

  return (
    <div className="flex min-h-[420px] gap-3 overflow-x-auto pb-2">
      {board.data.stages.map((stage) => (
        <div
          key={stage.id}
          className="flex w-[260px] shrink-0 flex-col rounded-lg border border-border/60 bg-muted/10"
        >
          <div className="border-b border-border/50 px-3 py-2">
            <div className="text-[13px] font-semibold">{stage.name}</div>
            <div className="text-[11px] text-muted-foreground">
              {stage.opportunities.length} · {stage.defaultProbabilityPercent}%
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2 p-2">
            {stage.opportunities.map((opp) => (
              <button
                key={opp.id}
                type="button"
                onClick={() => onSelect(opp.id)}
                className="rounded-md border border-border/50 bg-background px-3 py-2 text-start transition hover:border-border"
              >
                <div className="truncate text-[13px] font-medium">{opp.name}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {money(opp.expectedRevenue, opp.currency)} · {opp.probabilityPercent}%
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
