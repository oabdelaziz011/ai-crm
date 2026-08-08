import type { PlatformEvent, PlatformEventType } from "@workspace/platform-events";
import type { ProductionSubscriberDeps } from "./production-subscribers.js";
import type { LeadSmartCapturePort } from "../lead-intelligence/smart-capture-port.js";

type FollowUpPublisher = {
  publish(
    eventType: PlatformEventType,
    payload: unknown,
    context: {
      tenantId: string;
      correlationId: string;
      causationId?: string;
      actorType?: "system" | "user" | "ai";
      sourceModule: string;
      entityType?: string;
      entityId?: string;
    },
  ): Promise<unknown>;
};

/**
 * Production subscriber for Smart Capture (3.12.1) + Intelligence pipeline (3.12.2).
 * AI only reacts to platform events — never calls Omnichannel / AI Employee.
 */
export function createLeadIntelligenceSubscriber(
  deps: ProductionSubscriberDeps & {
    smartCapture: LeadSmartCapturePort;
    getPublisher: () => FollowUpPublisher;
  },
) {
  return {
    subscriberId: "lead_intelligence",
    subscribedEvents: [
      "ConversationStarted",
      "ConversationMessageReceived",
      "LeadAnalysisRequested",
    ] as PlatformEventType[],

    async handle(envelope: PlatformEvent) {
      const publisher = deps.getPublisher();

      if (envelope.eventType === "ConversationStarted") {
        const payload = envelope.payload as import("@workspace/platform-events").ConversationStartedPayload;
        const result = await deps.smartCapture.handleConversationStarted(payload);
        if (!result) return;

        await publisher.publish("LeadIntelligenceUpdated", result, {
          tenantId: envelope.tenantId,
          correlationId: envelope.correlationId,
          causationId: envelope.eventId,
          actorType: "system",
          sourceModule: "lead_intelligence",
          entityType: "lead",
          entityId: result.leadId,
        });

        await deps.reactive.emit({
          tenantId: envelope.tenantId,
          signalType: "leads.intelligence",
          entityType: "lead",
          entityId: result.leadId,
          correlationId: envelope.correlationId,
          sourceSubscriber: "lead_intelligence",
          metadata: { eventType: "LeadIntelligenceUpdated", conversationId: result.conversationId },
        });
        return;
      }

      if (envelope.eventType === "ConversationMessageReceived") {
        const payload =
          envelope.payload as import("@workspace/platform-events").ConversationMessageReceivedPayload;
        const { intelligence, analysisRequested } =
          await deps.smartCapture.handleConversationMessageReceived(payload);

        if (intelligence) {
          await publisher.publish("LeadIntelligenceUpdated", intelligence, {
            tenantId: envelope.tenantId,
            correlationId: envelope.correlationId,
            causationId: envelope.eventId,
            actorType: "system",
            sourceModule: "lead_intelligence",
            entityType: "lead",
            entityId: intelligence.leadId,
          });
        }

        if (analysisRequested) {
          await publisher.publish("LeadAnalysisRequested", analysisRequested, {
            tenantId: envelope.tenantId,
            correlationId: envelope.correlationId,
            causationId: envelope.eventId,
            actorType: "system",
            sourceModule: "lead_intelligence",
            entityType: "lead",
            entityId: analysisRequested.leadId,
          });
        }

        if (intelligence || analysisRequested) {
          await deps.reactive.emit({
            tenantId: envelope.tenantId,
            signalType: "leads.intelligence",
            entityType: "lead",
            entityId: intelligence?.leadId ?? analysisRequested?.leadId,
            correlationId: envelope.correlationId,
            sourceSubscriber: "lead_intelligence",
            metadata: {
              eventType: analysisRequested ? "LeadAnalysisRequested" : "LeadIntelligenceUpdated",
            },
          });
        }
        return;
      }

      if (envelope.eventType === "LeadAnalysisRequested") {
        const payload =
          envelope.payload as import("@workspace/platform-events").LeadAnalysisRequestedPayload;
        const result = await deps.smartCapture.handleAnalysisRequested(payload);
        if (!result) return;

        await publisher.publish("LeadIntelligenceUpdated", result, {
          tenantId: envelope.tenantId,
          correlationId: envelope.correlationId,
          causationId: envelope.eventId,
          actorType: "ai",
          sourceModule: "lead_intelligence",
          entityType: "lead",
          entityId: result.leadId,
        });

        await deps.reactive.emit({
          tenantId: envelope.tenantId,
          signalType: "leads.intelligence",
          entityType: "lead",
          entityId: result.leadId,
          correlationId: envelope.correlationId,
          sourceSubscriber: "lead_intelligence",
          metadata: {
            eventType: "LeadIntelligenceUpdated",
            phase: "analysis_completed",
            conversationId: result.conversationId,
          },
        });
      }
    },
  };
}
