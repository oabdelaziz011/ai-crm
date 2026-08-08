import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createContext,
  createLeadIntelligenceSubscriber,
  type LeadSmartCapturePort,
  type ProductionSubscriberDeps,
} from "@workspace/application-layer";
import {
  createLeadPlatformServices,
  createSupabaseLeadSmartCapture,
  runLeadAnalysisFromEvent,
} from "@workspace/lead-platform";
import {
  createConfiguredPlatformEventBus,
  createModulePublisher,
  type ConversationMessageReceivedPayload,
  type ConversationStartedPayload,
  type LeadAnalysisRequestedPayload,
  type LeadIntelligenceUpdatedPayload,
  type PlatformEventBus,
} from "@workspace/platform-events";

function createServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for lead intelligence bus.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function toSmartCapturePort(
  client: SupabaseClient,
  services: ReturnType<typeof createLeadPlatformServices>,
  capture: ReturnType<typeof createSupabaseLeadSmartCapture>,
): LeadSmartCapturePort {
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

/** Minimal deps — lead intelligence subscriber only needs smartCapture, reactive, getPublisher. */
function createStubSubscriberDeps(): ProductionSubscriberDeps {
  return {
    getServices: () => {
      throw new Error("Application services unavailable on api-server lead intelligence bus");
    },
    ports: {} as ProductionSubscriberDeps["ports"],
    reactive: {
      async emit() {
        /* api-server has no UI reactive bus; lead table updates drive login-app realtime */
      },
    },
    automation: {
      async dispatchFromPlatformEvent() {
        /* no-op on webhook path */
      },
    },
    buildSystemContext: (envelope) =>
      createContext({
        tenantId: envelope.tenantId,
        actorId: envelope.actorId ?? "system",
        actorType: "system",
        permissions: ["*"],
        correlationId: envelope.correlationId,
      }),
  };
}

let sharedBus: PlatformEventBus | null = null;

/**
 * Singleton PlatformEventBus for api-server webhook conversation path.
 * Registers createLeadIntelligenceSubscriber + Supabase smart capture.
 */
export function getApiServerLeadIntelligenceBus(
  client: SupabaseClient = createServiceClient(),
): PlatformEventBus {
  if (sharedBus) return sharedBus;

  const services = createLeadPlatformServices(client);
  const smartCapture = toSmartCapturePort(
    client,
    services,
    createSupabaseLeadSmartCapture(client, services),
  );
  const deps = createStubSubscriberDeps();

  sharedBus = createConfiguredPlatformEventBus(
    [
      createLeadIntelligenceSubscriber({
        ...deps,
        smartCapture,
        getPublisher: () => createModulePublisher(sharedBus!, "lead_intelligence"),
      }),
    ],
    { awaitSubscribers: false },
  );

  return sharedBus;
}

export function publishConversationStarted(payload: ConversationStartedPayload): Promise<unknown> {
  const publisher = createModulePublisher(getApiServerLeadIntelligenceBus(), "conversation");
  return publisher.publish("ConversationStarted", payload, {
    tenantId: payload.companyId,
    correlationId: `${payload.conversationId}:ConversationStarted:${payload.createdAt}`,
    actorId: payload.actorUserId ?? undefined,
    actorType: payload.actorUserId ? "user" : "system",
    sourceModule: "conversation",
    entityType: "conversation",
    entityId: payload.conversationId,
    occurredAt: payload.createdAt,
  });
}

export function publishConversationMessageReceived(
  payload: ConversationMessageReceivedPayload,
): Promise<unknown> {
  const publisher = createModulePublisher(getApiServerLeadIntelligenceBus(), "conversation");
  return publisher.publish("ConversationMessageReceived", payload, {
    tenantId: payload.companyId,
    correlationId: `${payload.messageId}:ConversationMessageReceived:${payload.receivedAt}`,
    actorId: payload.actorUserId ?? undefined,
    actorType: "system",
    sourceModule: "conversation",
    entityType: "conversation",
    entityId: payload.conversationId,
    occurredAt: payload.receivedAt,
  });
}
