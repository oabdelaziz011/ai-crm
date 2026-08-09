import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";
import { resolveLeadAiSuggestion } from "@/lib/lead-intelligence/lead360-ai-loader";
import type { Lead360AiPanelDto } from "@/lib/lead-intelligence/lead360-ai-types";
import type { LeadAiAuditEntry, LeadAiStatusDto } from "@workspace/application-layer";
import {
  AiCard,
  ConfidenceBar,
  ProvenanceLine,
  ScoreGauge,
  SignalChip,
  businessWeekForCountry,
  humanizeSignal,
  pct,
} from "./lead360-ui";

export function Lead360AiWorkspace({
  aiStatus,
  aiAudit,
  panel,
}: {
  leadId: string;
  aiStatus?: LeadAiStatusDto | null;
  aiAudit?: readonly LeadAiAuditEntry[];
  panel?: Lead360AiPanelDto | null;
}) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { user, company } = useAuth();
  const qc = useQueryClient();
  const [auditOpen, setAuditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const intel = panel?.intelligence ?? null;
  const suggestions = panel?.suggestions ?? [];
  const memory = panel?.memory?.length
    ? panel.memory
    : (intel?.memoryFacts ?? []).map((f) => ({
        factKey: f.factKey,
        factValue: f.factValue,
        confidence: f.confidence,
        source: f.source,
        updatedAt: f.updatedAt,
      }));

  const interestBullets = useMemo(() => {
    if (!intel) return [];
    const items: string[] = [];
    for (const intent of intel.intents.slice(0, 4)) {
      items.push(humanizeSignal(String(intent.value)));
    }
    for (const fact of memory) {
      if (/crm|whatsapp|workflow|automation|module/i.test(fact.factKey + fact.factValue)) {
        items.push(fact.factValue || fact.factKey);
      }
    }
    return [...new Set(items)].slice(0, 6);
  }, [intel, memory]);

  const resolveMutation = useMutation({
    mutationFn: async (input: {
      suggestionId: string;
      status: "accepted" | "rejected" | "edited";
      editedValue?: unknown;
    }) => {
      if (!company?.id || !user?.id) throw new Error("Not authenticated");
      await resolveLeadAiSuggestion(supabase, {
        companyId: company.id,
        suggestionId: input.suggestionId,
        status: input.status,
        reviewerUserId: user.id,
        editedValue: input.editedValue,
      });
    },
    onSuccess: () => {
      setEditingId(null);
      void qc.invalidateQueries({ queryKey: ["lead360-workspace"] });
      void qc.invalidateQueries({ queryKey: ["leads-workspace"] });
      toast({ title: t("leads360.ai.saved") });
    },
    onError: (error) => {
      toast({
        title: t("leads360.ai.error"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    },
  });

  const confidenceRows = intel
    ? [
        {
          label: t("leads360.ai.country"),
          confidence: intel.country.countryCode.confidence,
          source: intel.country.countryCode.source,
        },
        {
          label: t("leads360.ai.company"),
          confidence: intel.companyName.confidence,
          source: intel.companyName.source,
        },
        {
          label: t("leads360.ai.intent"),
          confidence: intel.fieldConfidence.intents ?? intel.intents[0]?.confidence ?? 0,
          source: intel.intents[0]?.source,
        },
        {
          label: t("leads360.ai.industry"),
          confidence: intel.industry.confidence,
          source: intel.industry.source,
        },
        {
          label: t("leads360.ai.overallConfidence"),
          confidence: intel.overallConfidence,
          source: "pipeline",
        },
      ].filter((row) => row.confidence > 0)
    : [];

  if (!intel && suggestions.length === 0 && memory.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 px-6 py-16 text-center">
        <p className="text-[14px] font-medium text-foreground">
          {t("leads360.ai.emptyTitle")}
        </p>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {t("leads360.ai.emptyBody")}
        </p>
        {aiStatus?.captureState ? (
          <p className="mt-4 text-[12px] text-muted-foreground">
            {t("leads360.ai.auditMeta.capture")} · {aiStatus.captureState}
            {aiStatus.contextReady
              ? ` · ${t("leads360.ai.auditMeta.contextReady")}`
              : ` · ${t("leads360.ai.auditMeta.collecting")}`}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {intel?.summary.value ? (
        <AiCard title={t("leads360.ai.summary")}>
          <p className="text-[14px] leading-relaxed text-foreground/90">{intel.summary.value}</p>
          {interestBullets.length > 0 ? (
            <div className="mt-3">
              <p className="text-[12px] font-medium text-muted-foreground">
                {t("leads360.ai.interestedModules")}
              </p>
              <ul className="mt-2 space-y-1 text-[13px] text-foreground">
                {interestBullets.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <ProvenanceLine
            confidence={intel.summary.confidence}
            source={intel.summary.source}
            updatedAt={intel.analyzedAt}
          />
        </AiCard>
      ) : null}

      {intel ? (
        <AiCard title={t("leads360.ai.score")}>
          <ScoreGauge score={intel.score.overall.value} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(
              [
                [t("leads360.ai.scoreDimensions.overall"), intel.score.overall],
                [t("leads360.ai.scoreDimensions.engagement"), intel.score.engagement],
                [t("leads360.ai.scoreDimensions.salesReadiness"), intel.score.salesReadiness],
                [t("leads360.ai.scoreDimensions.businessFit"), intel.score.businessFit],
              ] as const
            ).map(([label, field]) => (
              <div key={label} className="rounded-lg border border-border/40 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
                <div className="mt-0.5 text-[15px] font-semibold tabular-nums">
                  {Math.round(field.value)}
                </div>
                <ProvenanceLine confidence={field.confidence} source={field.source} updatedAt={intel.analyzedAt} />
              </div>
            ))}
          </div>
        </AiCard>
      ) : null}

      {confidenceRows.length > 0 ? (
        <AiCard title={t("leads360.ai.confidence")}>
          <div className="space-y-3">
            {confidenceRows.map((row) => (
              <ConfidenceBar
                key={row.label}
                label={row.label}
                confidence={row.confidence}
                source={row.source}
              />
            ))}
          </div>
        </AiCard>
      ) : null}

      {intel?.country.country.value || intel?.country.countryCode.value ? (
        <AiCard title={t("leads360.ai.countryIntelligence")}>
          <dl className="grid gap-3 sm:grid-cols-2">
            {(
              [
                [t("leads360.ai.country"), intel.country.country.value, intel.country.country],
                [t("leads360.ai.countryFields.countryCode"), intel.country.countryCode.value, intel.country.countryCode],
                [t("leads360.ai.market"), intel.country.market.value, intel.country.market],
                [t("leads360.ai.countryFields.currency"), intel.country.currency.value, intel.country.currency],
                [t("leads360.ai.countryFields.timezone"), intel.country.timezone.value, intel.country.timezone],
                [t("leads360.ai.countryFields.language"), intel.country.language.value, intel.country.language],
                [t("leads360.ai.countryFields.locale"), intel.country.locale.value, intel.country.locale],
              ] as const
            )
              .filter(([, value]) => Boolean(value))
              .map(([label, value, field]) => (
                <div key={label}>
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-[14px] font-semibold">{value}</dd>
                  <ProvenanceLine confidence={field.confidence} source={field.source} updatedAt={intel.analyzedAt} />
                </div>
              ))}
            {businessWeekForCountry(intel.country.countryCode.value) ? (
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t("leads360.ai.countryFields.businessWeek")}
                </dt>
                <dd className="mt-0.5 text-[14px] font-semibold">
                  {businessWeekForCountry(intel.country.countryCode.value)}
                </dd>
              </div>
            ) : null}
          </dl>
        </AiCard>
      ) : null}

      {intel?.buyingSignals?.length ? (
        <AiCard title={t("leads360.ai.sections.buyingSignals")}>
          <div className="flex flex-wrap gap-2">
            {intel.buyingSignals.map((signal) => (
              <div key={`${signal.type}-${signal.timestamp}`} className="space-y-1">
                <SignalChip label={humanizeSignal(signal.type)} tone="buy" />
                <ProvenanceLine
                  confidence={signal.confidence}
                  source={signal.source}
                  updatedAt={signal.timestamp ?? intel.analyzedAt}
                />
              </div>
            ))}
          </div>
        </AiCard>
      ) : null}

      {intel?.riskSignals?.length ? (
        <AiCard title={t("leads360.ai.sections.riskSignals")}>
          <div className="flex flex-wrap gap-2">
            {intel.riskSignals.map((signal) => (
              <div key={`${signal.type}-${signal.timestamp}`} className="space-y-1">
                <SignalChip label={humanizeSignal(signal.type)} tone="risk" />
                <ProvenanceLine
                  confidence={signal.confidence}
                  source={signal.source}
                  updatedAt={signal.timestamp ?? intel.analyzedAt}
                />
              </div>
            ))}
          </div>
        </AiCard>
      ) : null}

      {intel?.recommendations[0] ? (
        <AiCard title={t("leads360.ai.recommendation")}>
          <p className="text-[16px] font-semibold tracking-tight">{intel.recommendations[0].action}</p>
          <p className="mt-2 text-[13px] text-muted-foreground">{intel.recommendations[0].reason}</p>
          <ProvenanceLine
            confidence={intel.recommendations[0].confidence}
            source={intel.recommendations[0].source}
            updatedAt={intel.analyzedAt}
          />
        </AiCard>
      ) : null}

      {memory.length > 0 ? (
        <AiCard title={t("leads360.ai.sections.memory")}>
          <ol className="relative space-y-3 border-s border-border/60 ps-4">
            {memory.slice(0, 12).map((fact) => (
              <li key={`${fact.factKey}-${fact.updatedAt}`} className="relative">
                <span className="absolute -start-[1.3rem] top-1.5 size-2 rounded-full bg-foreground/70" />
                <p className="text-[13px] font-medium text-foreground">
                  {fact.factValue || fact.factKey}
                </p>
                <ProvenanceLine
                  confidence={fact.confidence}
                  source={fact.source}
                  updatedAt={fact.updatedAt}
                />
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {t("leads360.ai.memoryHint")}
          </p>
        </AiCard>
      ) : null}

      {suggestions.length > 0 ? (
        <AiCard title={t("leads360.ai.sections.suggestions")}>
          <div className="space-y-3">
            {suggestions.map((suggestion) => {
              const proposed =
                typeof suggestion.proposedValue === "object" &&
                suggestion.proposedValue &&
                "value" in (suggestion.proposedValue as object)
                  ? String((suggestion.proposedValue as { value: unknown }).value ?? "")
                  : JSON.stringify(suggestion.proposedValue);
              return (
                <div
                  key={suggestion.id}
                  className="rounded-lg border border-border/50 bg-muted/20 px-3 py-3"
                >
                  <div className="text-[12px] uppercase tracking-wide text-muted-foreground">
                    {suggestion.fieldKey}
                  </div>
                  <div className="mt-1 text-[14px] font-semibold">{proposed}</div>
                  <ProvenanceLine confidence={suggestion.confidence} source={suggestion.reason} />
                  {editingId === suggestion.id ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Input
                        className="h-9 max-w-sm"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        aria-label={t("leads360.ai.edit")}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-9"
                        disabled={resolveMutation.isPending}
                        onClick={() =>
                          resolveMutation.mutate({
                            suggestionId: suggestion.id,
                            status: "edited",
                            editedValue: { value: editValue },
                          })
                        }
                      >
                        {t("buttons.save")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9"
                        onClick={() => setEditingId(null)}
                      >
                        {t("buttons.cancel")}
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8"
                        disabled={resolveMutation.isPending}
                        onClick={() =>
                          resolveMutation.mutate({
                            suggestionId: suggestion.id,
                            status: "accepted",
                          })
                        }
                      >
                        {t("leads360.ai.accept")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={resolveMutation.isPending}
                        onClick={() => {
                          setEditingId(suggestion.id);
                          setEditValue(proposed);
                        }}
                      >
                        {t("leads360.ai.edit")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        disabled={resolveMutation.isPending}
                        onClick={() =>
                          resolveMutation.mutate({
                            suggestionId: suggestion.id,
                            status: "rejected",
                          })
                        }
                      >
                        {t("leads360.ai.reject")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </AiCard>
      ) : null}

      {aiAudit && aiAudit.length > 0 ? (
        <AiCard
          title={t("leads360.ai.sections.audit")}
          action={
            <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setAuditOpen(true)}>
              {t("leads360.ai.viewFullAudit")}
            </Button>
          }
        >
          <div className="space-y-2">
            {aiAudit.slice(0, 5).map((entry) => (
              <div key={entry.id} className="rounded-lg border border-border/40 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold">{entry.decision}</p>
                  <p className="text-[11px] text-muted-foreground">{entry.createdAt}</p>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">{entry.reason}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    {t("leads360.ai.auditMeta.provider")} · {(entry.metadata?.provider as string) || "ai"}
                  </span>
                  {entry.confidence != null ? (
                    <span>
                      {t("leads360.ai.auditMeta.confidence")} {pct(Number(entry.confidence))}
                    </span>
                  ) : null}
                  {typeof entry.metadata?.latencyMs === "number" ? (
                    <span>
                      {t("leads360.ai.auditMeta.latency")} · {entry.metadata.latencyMs}ms
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </AiCard>
      ) : null}

      <Lead360AuditDialog open={auditOpen} onOpenChange={setAuditOpen} entries={aiAudit ?? []} />
    </div>
  );
}

function Lead360AuditDialog({
  open,
  onOpenChange,
  entries,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: readonly LeadAiAuditEntry[];
}) {
  const { t } = useTranslation("common");
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const slice = entries.slice(page * pageSize, page * pageSize + pageSize);
  const pages = Math.max(1, Math.ceil(entries.length / pageSize));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("leads360.ai.fullAudit")}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pe-1">
          {slice.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-border/50 px-3 py-2.5 text-[13px]">
              <div className="font-semibold">{entry.decision}</div>
              <p className="mt-1 text-muted-foreground">{entry.reason}</p>
              <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                <span>
                  {t("leads360.ai.auditMeta.provider")} · {(entry.metadata?.provider as string) || "ai"}
                </span>
                <span>
                  {t("leads360.ai.auditMeta.actor")} · {entry.actor}
                </span>
                <span>
                  {t("leads360.ai.auditMeta.confidence")} ·{" "}
                  {entry.confidence != null ? pct(Number(entry.confidence)) : "—"}
                </span>
                <span>
                  {t("leads360.ai.auditMeta.latency")} ·{" "}
                  {typeof entry.metadata?.latencyMs === "number" ? `${entry.metadata.latencyMs}ms` : "—"}
                </span>
                <span className="sm:col-span-2">{entry.createdAt}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            {t("leads360.ai.pagination.previous")}
          </Button>
          <span className="text-[12px] text-muted-foreground">
            {page + 1} / {pages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
          >
            {t("leads360.ai.pagination.next")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
