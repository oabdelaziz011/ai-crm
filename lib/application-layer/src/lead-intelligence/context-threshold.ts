/**
 * Rule-based context threshold — no AI analysis (Sprint 3.12.1).
 * Collect until enough signals exist, then publish LeadAnalysisRequested.
 * Implementation lives in @workspace/lead-platform (source of truth).
 */

export { evaluateContextThreshold } from "@workspace/lead-platform";

export type ContextThresholdInput = Readonly<{
  messageCount: number;
  contentPreview?: string | null;
  existingSignals?: readonly string[];
}>;

export type ContextThresholdResult = Readonly<{
  ready: boolean;
  signals: readonly string[];
  messageCount: number;
}>;
