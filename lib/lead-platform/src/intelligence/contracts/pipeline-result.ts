import type { FieldProvenance } from "./field-value.js";
import type { ProviderRunMeta } from "./providers.js";

export type IntentLabel =
  | "pricing"
  | "demo"
  | "implementation"
  | "support"
  | "complaint"
  | "billing"
  | "integration"
  | "other";

export type SentimentLabel = "positive" | "negative" | "neutral";

export type TemperatureBand = "hot" | "warm" | "cold";

export type BuyingSignalType =
  | "asked_pricing"
  | "mentioned_budget"
  | "mentioned_employees"
  | "requested_demo"
  | "requested_proposal"
  | "mentioned_decision_maker"
  | "mentioned_competitor";

export type RiskSignalType =
  | "negative_sentiment"
  | "budget_objection"
  | "long_silence"
  | "using_competitor"
  | "decision_delay"
  | "not_decision_maker";

export type BuyingSignal = Readonly<{
  type: BuyingSignalType;
  confidence: number;
  source: string;
  timestamp: string;
}>;

export type RiskSignal = Readonly<{
  type: RiskSignalType;
  confidence: number;
  source: string;
  timestamp: string;
}>;

export type CountryIntel = Readonly<{
  country: FieldProvenance<string | null>;
  countryCode: FieldProvenance<string | null>;
  market: FieldProvenance<string | null>;
  timezone: FieldProvenance<string | null>;
  currency: FieldProvenance<string | null>;
  language: FieldProvenance<string | null>;
  locale: FieldProvenance<string | null>;
}>;

export type DetectedEntities = Readonly<{
  emails: readonly FieldProvenance<string>[];
  phones: readonly FieldProvenance<string>[];
  urls: readonly FieldProvenance<string>[];
}>;

export type LeadScoreDimensions = Readonly<{
  overall: FieldProvenance<number>;
  engagement: FieldProvenance<number>;
  salesReadiness: FieldProvenance<number>;
  businessFit: FieldProvenance<number>;
  temperature: FieldProvenance<number>;
  temperatureBand: FieldProvenance<TemperatureBand>;
}>;

export type RecommendationAction = Readonly<{
  action: string;
  confidence: number;
  reason: string;
  source: string;
}>;

export type MemoryFact = Readonly<{
  factKey: string;
  factValue: string;
  confidence: number;
  source: string;
  updatedAt: string;
}>;

/** Per-field confidence map for observability / UI. */
export type FieldConfidenceMap = Readonly<Record<string, number>>;

export type LeadIntelligenceResult = Readonly<{
  companyId: string;
  leadId: string;
  conversationId: string;

  language: FieldProvenance<string>;
  country: CountryIntel;
  contactName: FieldProvenance<string | null>;
  companyName: FieldProvenance<string | null>;
  industry: FieldProvenance<string | null>;
  intents: readonly FieldProvenance<IntentLabel>[];
  entities: DetectedEntities;
  summary: FieldProvenance<string>;
  sentiment: FieldProvenance<SentimentLabel>;
  buyingSignals: readonly BuyingSignal[];
  riskSignals: readonly RiskSignal[];
  temperature: FieldProvenance<TemperatureBand>;
  score: LeadScoreDimensions;
  recommendations: readonly RecommendationAction[];
  memoryFacts: readonly MemoryFact[];

  fieldConfidence: FieldConfidenceMap;
  overallConfidence: number;
  processingTimeMs: number;

  /** Capture state after successful analysis (prospect/context_ready → lead). */
  captureState: "lead" | "prospect" | "context_ready";
  success: boolean;

  providerMetas: Readonly<Record<string, ProviderRunMeta>>;
  analyzedAt: string;
}>;
