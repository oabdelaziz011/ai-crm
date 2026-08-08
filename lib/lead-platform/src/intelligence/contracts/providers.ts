import type { FieldProvenance } from "./field-value.js";
import type { ProviderContext } from "./provider-context.js";
import type {
  BuyingSignal,
  CountryIntel,
  DetectedEntities,
  IntentLabel,
  LeadScoreDimensions,
  MemoryFact,
  RecommendationAction,
  RiskSignal,
  SentimentLabel,
  TemperatureBand,
} from "./pipeline-result.js";

/**
 * Run metadata for every provider — contracts support model/version/latency
 * even when heuristic implementations use fixed placeholders.
 */
export type ProviderRunMeta = Readonly<{
  providerId: string;
  model: string;
  version: string;
  latencyMs: number;
  reason?: string;
}>;

export type ProviderResult<T> = Readonly<{
  data: T;
  meta: ProviderRunMeta;
}>;

export interface LanguageProvider {
  detectLanguage(ctx: ProviderContext): Promise<ProviderResult<FieldProvenance<string>>>;
}

export interface CountryProvider {
  detectCountry(ctx: ProviderContext): Promise<ProviderResult<CountryIntel>>;
}

export interface IdentityProvider {
  extractIdentity(
    ctx: ProviderContext,
  ): Promise<ProviderResult<FieldProvenance<string | null>>>;
}

export interface CompanyProvider {
  extractCompany(
    ctx: ProviderContext,
  ): Promise<ProviderResult<FieldProvenance<string | null>>>;
}

export interface IndustryProvider {
  detectIndustry(
    ctx: ProviderContext,
  ): Promise<ProviderResult<FieldProvenance<string | null>>>;
}

export interface IntentProvider {
  detectIntents(
    ctx: ProviderContext,
  ): Promise<ProviderResult<readonly FieldProvenance<IntentLabel>[]>>;
}

export interface EntityProvider {
  extractEntities(ctx: ProviderContext): Promise<ProviderResult<DetectedEntities>>;
}

export interface SummaryProvider {
  summarize(ctx: ProviderContext): Promise<ProviderResult<FieldProvenance<string>>>;
}

export interface SentimentProvider {
  analyzeSentiment(
    ctx: ProviderContext,
  ): Promise<ProviderResult<FieldProvenance<SentimentLabel>>>;
}

export interface BuyingSignalsProvider {
  detectBuyingSignals(
    ctx: ProviderContext,
  ): Promise<ProviderResult<readonly BuyingSignal[]>>;
}

export interface RiskSignalsProvider {
  detectRiskSignals(ctx: ProviderContext): Promise<ProviderResult<readonly RiskSignal[]>>;
}

export interface TemperatureProvider {
  assessTemperature(
    ctx: ProviderContext,
  ): Promise<ProviderResult<FieldProvenance<TemperatureBand>>>;
}

export interface LeadScoreProvider {
  scoreLead(ctx: ProviderContext): Promise<ProviderResult<LeadScoreDimensions>>;
}

export interface RecommendationProvider {
  recommend(
    ctx: ProviderContext,
  ): Promise<ProviderResult<readonly RecommendationAction[]>>;
}

export interface MemoryProvider {
  extractMemory(ctx: ProviderContext): Promise<ProviderResult<readonly MemoryFact[]>>;
}

/** Bundle of all analysis providers used by the pipeline. */
export type LeadIntelligenceProviders = Readonly<{
  language: LanguageProvider;
  country: CountryProvider;
  identity: IdentityProvider;
  company: CompanyProvider;
  industry: IndustryProvider;
  intent: IntentProvider;
  entity: EntityProvider;
  summary: SummaryProvider;
  sentiment: SentimentProvider;
  buyingSignals: BuyingSignalsProvider;
  riskSignals: RiskSignalsProvider;
  temperature: TemperatureProvider;
  leadScore: LeadScoreProvider;
  recommendation: RecommendationProvider;
  memory: MemoryProvider;
}>;
