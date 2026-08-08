import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConversationMessageReceivedPayload,
  ConversationStartedPayload,
  LeadAnalysisRequestedPayload,
  LeadIntelligenceUpdatedPayload,
} from "@workspace/platform-events";
import type { LeadSmartCapturePort } from "@workspace/application-layer";
import { runLeadAnalysisFromEvent, createSupabaseLeadSmartCapture } from "@workspace/lead-platform";
import { createLoginAppLeadPlatformServices } from "@/lib/lead-platform/lead-platform-factory.js";

/**
 * Login-app Smart Capture + Intelligence adapter.
 * Analysis runs only when LeadAnalysisRequested is handled (event-driven).
 */
export function createLoginAppLeadSmartCapturePort(client: SupabaseClient): LeadSmartCapturePort {
  const services = createLoginAppLeadPlatformServices(client);
  const capture = createSupabaseLeadSmartCapture(client, services);

  return {
    async handleConversationStarted(payload: ConversationStartedPayload) {
      const result = await capture.handleConversationStarted(payload);
      return result as LeadIntelligenceUpdatedPayload | null;
    },

    async handleConversationMessageReceived(payload: ConversationMessageReceivedPayload) {
      const result = await capture.handleConversationMessageReceived(payload);
      return {
        intelligence: (result.intelligence ?? null) as LeadIntelligenceUpdatedPayload | null,
        analysisRequested: (result.analysisRequested ?? null) as LeadAnalysisRequestedPayload | null,
      };
    },

    async handleAnalysisRequested(payload: LeadAnalysisRequestedPayload) {
      const { result, applied } = await runLeadAnalysisFromEvent(client, services, {
        companyId: payload.companyId,
        leadId: payload.leadId,
        conversationId: payload.conversationId,
      });

      return {
        companyId: payload.companyId,
        leadId: payload.leadId,
        conversationId: payload.conversationId,
        captureState: applied.captureState,
        identityStatus: "matched_lead",
        created: false,
        contextReady: true,
        confidence: result.overallConfidence ?? applied.overallConfidence,
      } satisfies LeadIntelligenceUpdatedPayload;
    },

    getAiStatus: (companyId, leadId) => capture.getAiStatus(companyId, leadId),
    listAudit: (companyId, leadId, limit) => capture.listAudit(companyId, leadId, limit),
  };
}
