/**
 * AI Smart Lead Capture types — re-exported from lead-platform (source of truth).
 * Prospect is an AI capture state on the canonical Lead model (not a separate CRM).
 */

export {
  AI_CAPTURE_STATES,
  AI_CAPTURE_ACTIVITY_TYPES,
  AI_AUDIT_DECISIONS,
  UNKNOWN_CONTACT_NAME,
  emptyAiCapture,
  readAiCapture,
  toAiStatusDto,
  evaluateContextThreshold,
} from "@workspace/lead-platform";

export type {
  AiCaptureState,
  IdentityGraphNode,
  IdentityKeyMap,
  AiCaptureIdentityStatus,
  AiCaptureMetadata,
  AiAuditDecision,
  LeadAiAuditEntry,
  LeadAiStatusDto,
  ConversationStartedCaptureInput,
  ConversationMessageCaptureInput,
  LeadIntelligenceUpdatedResult,
  LeadAnalysisRequestedResult,
} from "@workspace/lead-platform";
