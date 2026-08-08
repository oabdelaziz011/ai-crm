import type { FieldProvenance } from "./field-value.js";
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
import type { ProviderRunMeta } from "./providers.js";

export type ProviderMessageRole = "customer" | "agent" | "system" | "bot" | "unknown";

export type ProviderMessage = Readonly<{
  id: string;
  /** Speaker role or message type (customer/agent/system/…). */
  role: ProviderMessageRole | string;
  content: string;
  createdAt: string;
}>;

export type LeadSnapshot = Readonly<{
  phone?: string | null;
  email?: string | null;
  title?: string | null;
  contactName?: string | null;
  companyName?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Channel keys from identityGraph / conversation. */
  channelHints?: readonly string[];
}>;

export type ProviderConfig = Readonly<{
  /** Write CRM fields when confidence >= threshold; else suggest. Default 0.72. */
  suggestionThreshold: number;
  localeHints?: readonly string[];
}>;

export const DEFAULT_SUGGESTION_THRESHOLD = 0.72;

/**
 * Accumulating pipeline state — each provider reads prior outputs.
 */
export type PipelineState = Readonly<{
  language?: FieldProvenance<string>;
  country?: CountryIntel;
  contactName?: FieldProvenance<string | null>;
  companyName?: FieldProvenance<string | null>;
  industry?: FieldProvenance<string | null>;
  intents?: readonly FieldProvenance<IntentLabel>[];
  entities?: DetectedEntities;
  summary?: FieldProvenance<string>;
  sentiment?: FieldProvenance<SentimentLabel>;
  buyingSignals?: readonly BuyingSignal[];
  riskSignals?: readonly RiskSignal[];
  temperature?: FieldProvenance<TemperatureBand>;
  score?: LeadScoreDimensions;
  recommendations?: readonly RecommendationAction[];
  memoryFacts?: readonly MemoryFact[];
  providerMetas?: Readonly<Record<string, ProviderRunMeta>>;
}>;

export type ProviderContext = Readonly<{
  companyId: string;
  leadId: string;
  conversationId: string;
  messages: readonly ProviderMessage[];
  lead: LeadSnapshot;
  prior: PipelineState;
  config: ProviderConfig;
}>;

export function createEmptyPipelineState(): PipelineState {
  return Object.freeze({
    providerMetas: Object.freeze({}),
  });
}

export function createProviderConfig(
  partial?: Partial<ProviderConfig>,
): ProviderConfig {
  return Object.freeze({
    suggestionThreshold:
      typeof partial?.suggestionThreshold === "number"
        ? partial.suggestionThreshold
        : DEFAULT_SUGGESTION_THRESHOLD,
    localeHints: partial?.localeHints,
  });
}
