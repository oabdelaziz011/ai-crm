import type {
  ConversationMessageReceivedPayload,
  ConversationStartedPayload,
  LeadAnalysisRequestedPayload,
  LeadIntelligenceUpdatedPayload,
} from "@workspace/platform-events";
import type { LeadAiAuditEntry, LeadAiStatusDto } from "./capture-types.js";

/**
 * Port implemented by login-app / api-server adapters.
 * Subscriber stays event-driven and never imports Omnichannel or AI Employee.
 */
export type LeadSmartCapturePort = {
  handleConversationStarted(
    payload: ConversationStartedPayload,
  ): Promise<LeadIntelligenceUpdatedPayload | null>;

  handleConversationMessageReceived(
    payload: ConversationMessageReceivedPayload,
  ): Promise<{
    intelligence?: LeadIntelligenceUpdatedPayload | null;
    analysisRequested?: LeadAnalysisRequestedPayload | null;
  }>;

  /** Sprint 3.12.2 — runs provider pipeline after LeadAnalysisRequested. */
  handleAnalysisRequested(
    payload: LeadAnalysisRequestedPayload,
  ): Promise<LeadIntelligenceUpdatedPayload | null>;

  getAiStatus(companyId: string, leadId: string): Promise<LeadAiStatusDto>;

  listAudit(companyId: string, leadId: string, limit?: number): Promise<readonly LeadAiAuditEntry[]>;
};
