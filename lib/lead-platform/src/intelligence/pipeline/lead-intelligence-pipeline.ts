import type { FieldProvenance } from "../contracts/field-value.js";
import {
  createEmptyPipelineState,
  createProviderConfig,
  type PipelineState,
  type ProviderConfig,
  type ProviderContext,
  type ProviderMessage,
  type LeadSnapshot,
} from "../contracts/provider-context.js";
import type {
  FieldConfidenceMap,
  LeadIntelligenceResult,
} from "../contracts/pipeline-result.js";
import type {
  LeadIntelligenceProviders,
  ProviderRunMeta,
} from "../contracts/providers.js";

export type IntelligenceAuditEntry = Readonly<{
  providerId: string;
  decision: string;
  reason: string;
  confidence: number | null;
  meta: ProviderRunMeta;
  inputPreview?: string;
  outputPreview?: string;
}>;

/** Callback used as the Audit Writer step (not a parallel AI engine). */
export type IntelligenceAuditWriter = (
  entry: IntelligenceAuditEntry,
) => void | Promise<void>;

export type PipelineObservability = {
  processingTimeMs: number;
  providersRun: number;
  providerFailures: number;
  auditWrites: number;
  startedAt: string;
  finishedAt: string | null;
};

export type RunLeadIntelligencePipelineInput = Readonly<{
  companyId: string;
  leadId: string;
  conversationId: string;
  messages: readonly ProviderMessage[];
  lead: LeadSnapshot;
  /** Optional prior memory/state (e.g. previous run). */
  prior?: PipelineState;
  config?: Partial<ProviderConfig>;
  /** Incoming capture state — advanced to `lead` on success when prospect/context_ready. */
  captureState?: "prospect" | "context_ready" | "lead" | string;
}>;

function preview(value: unknown, max = 240): string {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    return s.length <= max ? s : `${s.slice(0, max)}…`;
  } catch {
    return "";
  }
}

function averageConfidence(values: number[]): number {
  const nums = values.filter((n) => Number.isFinite(n));
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function buildFieldConfidence(state: PipelineState): FieldConfidenceMap {
  const map: Record<string, number> = {};
  if (state.language) map.language = state.language.confidence;
  if (state.contactName) map.contactName = state.contactName.confidence;
  if (state.companyName) map.companyName = state.companyName.confidence;
  if (state.industry) map.industry = state.industry.confidence;
  if (state.summary) map.summary = state.summary.confidence;
  if (state.sentiment) map.sentiment = state.sentiment.confidence;
  if (state.temperature) map.temperature = state.temperature.confidence;
  if (state.country?.countryCode) map.countryCode = state.country.countryCode.confidence;
  if (state.score?.overall) map.scoreOverall = state.score.overall.confidence;
  if (state.intents?.length) {
    map.intents = averageConfidence(state.intents.map((i) => i.confidence));
  }
  return Object.freeze(map);
}

function emptyLanguage(): FieldProvenance<string> {
  return Object.freeze({
    value: "unknown",
    confidence: 0,
    source: "pipeline.fallback",
    updatedAt: new Date().toISOString(),
  });
}

async function runStep<T>(
  name: string,
  fn: () => Promise<{ data: T; meta: ProviderRunMeta }>,
  auditWriter: IntelligenceAuditWriter | undefined,
  observability: PipelineObservability,
  inputPreview: string,
): Promise<{ data: T | null; meta: ProviderRunMeta | null }> {
  observability.providersRun += 1;
  try {
    const out = await fn();
    if (auditWriter) {
      observability.auditWrites += 1;
      await auditWriter({
        providerId: out.meta.providerId,
        decision: `${name}_completed`,
        reason: out.meta.reason ?? `${name} ok`,
        confidence: null,
        meta: out.meta,
        inputPreview,
        outputPreview: preview(out.data),
      });
    }
    return out;
  } catch (err) {
    observability.providerFailures += 1;
    const meta: ProviderRunMeta = Object.freeze({
      providerId: name,
      model: "unknown",
      version: "error",
      latencyMs: 0,
      reason: err instanceof Error ? err.message : String(err),
    });
    if (auditWriter) {
      observability.auditWrites += 1;
      await auditWriter({
        providerId: name,
        decision: `${name}_failed`,
        reason: meta.reason ?? "provider failure",
        confidence: 0,
        meta,
        inputPreview,
        outputPreview: "",
      });
    }
    return { data: null, meta };
  }
}

/**
 * Ordered AI Lead Intelligence pipeline (Sprint 3.12.2).
 * Extends event-driven Smart Capture — not a parallel CRM/AI engine package.
 */
export async function runLeadIntelligencePipeline(
  input: RunLeadIntelligencePipelineInput,
  providers: LeadIntelligenceProviders,
  auditWriter?: IntelligenceAuditWriter,
): Promise<{
  result: LeadIntelligenceResult;
  observability: PipelineObservability;
  state: PipelineState;
}> {
  const startedAt = new Date().toISOString();
  const wallStart = Date.now();
  const observability: PipelineObservability = {
    processingTimeMs: 0,
    providersRun: 0,
    providerFailures: 0,
    auditWrites: 0,
    startedAt,
    finishedAt: null,
  };

  const config = createProviderConfig(input.config);
  let state: PipelineState = {
    ...createEmptyPipelineState(),
    ...(input.prior ?? {}),
    providerMetas: { ...(input.prior?.providerMetas ?? {}) },
  };

  const baseCtx = (): ProviderContext =>
    Object.freeze({
      companyId: input.companyId,
      leadId: input.leadId,
      conversationId: input.conversationId,
      messages: input.messages,
      lead: input.lead,
      prior: state,
      config,
    });

  const inputPreview = preview(
    input.messages.map((m) => m.content).join(" ").slice(0, 200),
  );

  const mergeMeta = (meta: ProviderRunMeta | null) => {
    if (!meta) return;
    state = {
      ...state,
      providerMetas: { ...state.providerMetas, [meta.providerId]: meta },
    };
  };

  // 1 Language
  {
    const out = await runStep("language", () => providers.language.detectLanguage(baseCtx()), auditWriter, observability, inputPreview);
    if (out.data) state = { ...state, language: out.data };
    mergeMeta(out.meta);
  }
  // 2 Country
  {
    const out = await runStep("country", () => providers.country.detectCountry(baseCtx()), auditWriter, observability, inputPreview);
    if (out.data) state = { ...state, country: out.data };
    mergeMeta(out.meta);
  }
  // 3 Identity
  {
    const out = await runStep("identity", () => providers.identity.extractIdentity(baseCtx()), auditWriter, observability, inputPreview);
    if (out.data) state = { ...state, contactName: out.data };
    mergeMeta(out.meta);
  }
  // 4 Company
  {
    const out = await runStep("company", () => providers.company.extractCompany(baseCtx()), auditWriter, observability, inputPreview);
    if (out.data) state = { ...state, companyName: out.data };
    mergeMeta(out.meta);
  }
  // 5 Industry
  {
    const out = await runStep("industry", () => providers.industry.detectIndustry(baseCtx()), auditWriter, observability, inputPreview);
    if (out.data) state = { ...state, industry: out.data };
    mergeMeta(out.meta);
  }
  // 6 Intent
  {
    const out = await runStep("intent", () => providers.intent.detectIntents(baseCtx()), auditWriter, observability, inputPreview);
    if (out.data) state = { ...state, intents: out.data };
    mergeMeta(out.meta);
  }
  // 7 Entity
  {
    const out = await runStep("entity", () => providers.entity.extractEntities(baseCtx()), auditWriter, observability, inputPreview);
    if (out.data) state = { ...state, entities: out.data };
    mergeMeta(out.meta);
  }
  // 8 Summary
  {
    const out = await runStep("summary", () => providers.summary.summarize(baseCtx()), auditWriter, observability, inputPreview);
    if (out.data) state = { ...state, summary: out.data };
    mergeMeta(out.meta);
  }
  // 9 Sentiment
  {
    const out = await runStep("sentiment", () => providers.sentiment.analyzeSentiment(baseCtx()), auditWriter, observability, inputPreview);
    if (out.data) state = { ...state, sentiment: out.data };
    mergeMeta(out.meta);
  }
  // 10 Buying signals
  {
    const out = await runStep(
      "buyingSignals",
      () => providers.buyingSignals.detectBuyingSignals(baseCtx()),
      auditWriter,
      observability,
      inputPreview,
    );
    if (out.data) state = { ...state, buyingSignals: out.data };
    mergeMeta(out.meta);
  }
  // 11 Risk signals
  {
    const out = await runStep(
      "riskSignals",
      () => providers.riskSignals.detectRiskSignals(baseCtx()),
      auditWriter,
      observability,
      inputPreview,
    );
    if (out.data) state = { ...state, riskSignals: out.data };
    mergeMeta(out.meta);
  }
  // 12 Temperature
  {
    const out = await runStep(
      "temperature",
      () => providers.temperature.assessTemperature(baseCtx()),
      auditWriter,
      observability,
      inputPreview,
    );
    if (out.data) state = { ...state, temperature: out.data };
    mergeMeta(out.meta);
  }
  // 13 Lead score
  {
    const out = await runStep("leadScore", () => providers.leadScore.scoreLead(baseCtx()), auditWriter, observability, inputPreview);
    if (out.data) state = { ...state, score: out.data };
    mergeMeta(out.meta);
  }
  // 14 Recommendation
  {
    const out = await runStep(
      "recommendation",
      () => providers.recommendation.recommend(baseCtx()),
      auditWriter,
      observability,
      inputPreview,
    );
    if (out.data) state = { ...state, recommendations: out.data };
    mergeMeta(out.meta);
  }
  // 15 Memory
  {
    const out = await runStep("memory", () => providers.memory.extractMemory(baseCtx()), auditWriter, observability, inputPreview);
    if (out.data) state = { ...state, memoryFacts: out.data };
    mergeMeta(out.meta);
  }

  const fieldConfidence = buildFieldConfidence(state);
  const overallConfidence = averageConfidence(Object.values(fieldConfidence));
  const processingTimeMs = Math.max(0, Date.now() - wallStart);
  observability.processingTimeMs = processingTimeMs;
  observability.finishedAt = new Date().toISOString();

  const success = observability.providerFailures < 15 && Boolean(state.language || state.score);
  const incoming = input.captureState ?? "context_ready";
  const captureState =
    success && (incoming === "prospect" || incoming === "context_ready" || !incoming)
      ? "lead"
      : (incoming as LeadIntelligenceResult["captureState"]);

  const at = new Date().toISOString();
  const nullField = (source: string): FieldProvenance<string | null> =>
    Object.freeze({ value: null, confidence: 0, source, updatedAt: at });

  const result: LeadIntelligenceResult = Object.freeze({
    companyId: input.companyId,
    leadId: input.leadId,
    conversationId: input.conversationId,
    language: state.language ?? emptyLanguage(),
    country: state.country ?? {
      country: nullField("pipeline.fallback"),
      countryCode: nullField("pipeline.fallback"),
      market: nullField("pipeline.fallback"),
      timezone: nullField("pipeline.fallback"),
      currency: nullField("pipeline.fallback"),
      language: nullField("pipeline.fallback"),
      locale: nullField("pipeline.fallback"),
    },
    contactName: state.contactName ?? nullField("pipeline.fallback"),
    companyName: state.companyName ?? nullField("pipeline.fallback"),
    industry: state.industry ?? nullField("pipeline.fallback"),
    intents: state.intents ?? Object.freeze([]),
    entities: state.entities ?? Object.freeze({ emails: [], phones: [], urls: [] }),
    summary:
      state.summary ??
      Object.freeze({
        value: "",
        confidence: 0,
        source: "pipeline.fallback",
        updatedAt: at,
      }),
    sentiment:
      state.sentiment ??
      Object.freeze({
        value: "neutral" as const,
        confidence: 0,
        source: "pipeline.fallback",
        updatedAt: at,
      }),
    buyingSignals: state.buyingSignals ?? Object.freeze([]),
    riskSignals: state.riskSignals ?? Object.freeze([]),
    temperature:
      state.temperature ??
      Object.freeze({
        value: "cold" as const,
        confidence: 0,
        source: "pipeline.fallback",
        updatedAt: at,
      }),
    score: state.score ?? {
      overall: Object.freeze({ value: 0, confidence: 0, source: "pipeline.fallback", updatedAt: at }),
      engagement: Object.freeze({ value: 0, confidence: 0, source: "pipeline.fallback", updatedAt: at }),
      salesReadiness: Object.freeze({ value: 0, confidence: 0, source: "pipeline.fallback", updatedAt: at }),
      businessFit: Object.freeze({ value: 0, confidence: 0, source: "pipeline.fallback", updatedAt: at }),
      temperature: Object.freeze({ value: 0, confidence: 0, source: "pipeline.fallback", updatedAt: at }),
      temperatureBand: Object.freeze({
        value: "cold" as const,
        confidence: 0,
        source: "pipeline.fallback",
        updatedAt: at,
      }),
    },
    recommendations: state.recommendations ?? Object.freeze([]),
    memoryFacts: state.memoryFacts ?? Object.freeze([]),
    fieldConfidence,
    overallConfidence,
    processingTimeMs,
    captureState:
      captureState === "lead" || captureState === "prospect" || captureState === "context_ready"
        ? captureState
        : "lead",
    success,
    providerMetas: state.providerMetas ?? Object.freeze({}),
    analyzedAt: at,
  });

  if (auditWriter) {
    observability.auditWrites += 1;
    await auditWriter({
      providerId: "pipeline",
      decision: "analysis_completed",
      reason: success
        ? "Lead intelligence pipeline completed"
        : "Lead intelligence pipeline completed with failures",
      confidence: overallConfidence,
      meta: Object.freeze({
        providerId: "pipeline",
        model: "orchestrator",
        version: "3.12.2",
        latencyMs: processingTimeMs,
      }),
      inputPreview,
      outputPreview: preview({
        overallConfidence,
        captureState: result.captureState,
        intents: result.intents.length,
      }),
    });
  }

  recordPipelineObservability(observability);

  return { result, observability, state: Object.freeze(state) };
}

/** Mutable observability counters export for subscribers / metrics scrapers. */
export const leadIntelligencePipelineCounters = {
  runs: 0,
  failures: 0,
  lastProcessingTimeMs: 0,
  providerFailures: 0,
};

export function recordPipelineObservability(obs: PipelineObservability): void {
  leadIntelligencePipelineCounters.runs += 1;
  leadIntelligencePipelineCounters.lastProcessingTimeMs = obs.processingTimeMs;
  leadIntelligencePipelineCounters.providerFailures += obs.providerFailures;
  if (obs.providerFailures > 0) leadIntelligencePipelineCounters.failures += 1;
}
