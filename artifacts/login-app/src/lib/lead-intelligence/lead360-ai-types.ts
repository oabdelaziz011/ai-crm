import type { LeadIntelligenceResult } from "@workspace/lead-platform";

/** Lead360 AI panel payload — Sprint 3.12.2. */
export type Lead360AiSuggestionDto = Readonly<{
  id: string;
  fieldKey: string;
  proposedValue: unknown;
  currentValue: unknown;
  confidence: number;
  status: string;
  reason: string;
  createdAt: string;
}>;

export type Lead360AiMemoryFactDto = Readonly<{
  factKey: string;
  factValue: string;
  confidence: number;
  source: string;
  updatedAt: string;
}>;

export type Lead360AiPanelDto = Readonly<{
  intelligence: LeadIntelligenceResult | null;
  suggestions: readonly Lead360AiSuggestionDto[];
  memory: readonly Lead360AiMemoryFactDto[];
}>;
