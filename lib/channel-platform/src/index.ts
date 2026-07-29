import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelAdapterPort } from "./ports/channel-adapter-port.js";
import { createChannelAdapterRegistry } from "./adapters/channel-adapter-registry.js";
import { createStubWebChatAdapter } from "./adapters/stub-web-chat-adapter.js";
import { createWhatsAppCloudAdapter } from "./adapters/whatsapp/whatsapp-cloud-adapter.js";
import { createInstagramCloudAdapter } from "./adapters/instagram/instagram-cloud-adapter.js";
import { createMessengerCloudAdapter } from "./adapters/messenger/messenger-cloud-adapter.js";
import { ChannelDispatcher } from "./dispatcher/channel-dispatcher.js";
import { ChannelSessionEngine } from "./engines/channel-session-engine.js";
import { DeliveryTrackingEngine } from "./engines/delivery-tracking-engine.js";
import { DeliveryStatusPipeline } from "./pipelines/delivery-status-pipeline.js";
import { InboundMessagePipeline } from "./pipelines/inbound-message-pipeline.js";
import { OutboundMessagePipeline } from "./pipelines/outbound-message-pipeline.js";
import type { ChannelPlatformPorts } from "./ports/channel-platform-ports.js";
import type { ChannelWorkflowResolver } from "./services/channel-workflow-resolver.js";
import { NoopChannelTelemetryPort, type ChannelTelemetryPort } from "./ports/telemetry-port.js";
import { ChannelRouter } from "./router/channel-router.js";
import {
  createSupabaseChannelDeliveryEventRepository,
  createSupabaseChannelInboundEventRepository,
  createSupabaseChannelSessionRepository,
} from "./repositories/supabase-channel-repositories.js";

export type WhatsAppDirectOutboundBypassOptions = import("./adapters/whatsapp/whatsapp-direct-outbound-bypass.js").WhatsAppDirectOutboundBypassOptions;

export type ChannelPlatformServicesOptions = {
  ports: ChannelPlatformPorts;
  adapters?: ChannelAdapterPort[];
  telemetry?: ChannelTelemetryPort;
  whatsAppFetchFn?: typeof fetch;
  whatsAppCredentialsLoader?: import("./adapters/whatsapp/whatsapp-canonical-credentials.js").WhatsAppCredentialsLoader;
  whatsAppOutboundDiagnostic?: (detail: Record<string, unknown>) => void;
  whatsAppDirectOutboundBypass?: WhatsAppDirectOutboundBypassOptions;
  instagramFetchFn?: typeof fetch;
  instagramCredentialsLoader?: import("./adapters/instagram/instagram-canonical-credentials.js").InstagramCredentialsLoader;
  instagramOutboundDiagnostic?: (detail: Record<string, unknown>) => void;
  messengerFetchFn?: typeof fetch;
  messengerCredentialsLoader?: import("./adapters/messenger/messenger-canonical-credentials.js").MessengerCredentialsLoader;
  messengerOutboundDiagnostic?: (detail: Record<string, unknown>) => void;
  workflowResolver?: ChannelWorkflowResolver;
};

export type ChannelPlatformServices = {
  router: ChannelRouter;
  dispatcher: ChannelDispatcher;
  inboundPipeline: InboundMessagePipeline;
  outboundPipeline: OutboundMessagePipeline;
  deliveryStatusPipeline: DeliveryStatusPipeline;
};

export function createChannelPlatformServices(
  client: SupabaseClient,
  options: ChannelPlatformServicesOptions,
): ChannelPlatformServices {
  const sessionRepository = createSupabaseChannelSessionRepository(client);
  const inboundRepository = createSupabaseChannelInboundEventRepository(client);
  const deliveryRepository = createSupabaseChannelDeliveryEventRepository(client);

  const adapterRegistry = createChannelAdapterRegistry([
    createStubWebChatAdapter(),
    createWhatsAppCloudAdapter({
      fetchFn: options.whatsAppFetchFn,
      credentialsLoader: options.whatsAppCredentialsLoader,
      onOutboundDiagnostic: options.whatsAppOutboundDiagnostic,
    }),
    createInstagramCloudAdapter({
      fetchFn: options.instagramFetchFn,
      credentialsLoader: options.instagramCredentialsLoader,
      onOutboundDiagnostic: options.instagramOutboundDiagnostic,
    }),
    createMessengerCloudAdapter({
      fetchFn: options.messengerFetchFn,
      credentialsLoader: options.messengerCredentialsLoader,
      onOutboundDiagnostic: options.messengerOutboundDiagnostic,
    }),
    ...(options.adapters ?? []),
  ]);

  const telemetry = options.telemetry ?? new NoopChannelTelemetryPort();
  const sessionEngine = new ChannelSessionEngine(sessionRepository, options.ports);
  const deliveryEngine = new DeliveryTrackingEngine(deliveryRepository);

  const outboundPipeline = new OutboundMessagePipeline(
    options.ports,
    adapterRegistry,
    deliveryEngine,
    sessionRepository,
  );

  const dispatcher = new ChannelDispatcher(outboundPipeline, telemetry);
  const deliveryStatusPipeline = new DeliveryStatusPipeline(deliveryEngine, deliveryRepository);

  const inboundPipeline = new InboundMessagePipeline(
    options.ports,
    adapterRegistry,
    sessionEngine,
    dispatcher,
    inboundRepository,
    sessionRepository,
    options.workflowResolver,
    options.whatsAppDirectOutboundBypass,
  );

  const router = new ChannelRouter(
    inboundPipeline,
    deliveryStatusPipeline,
    adapterRegistry,
    options.ports,
    telemetry,
  );

  return { router, dispatcher, inboundPipeline, outboundPipeline, deliveryStatusPipeline };
}

export * from "./constants.js";
export * from "./types.js";
export * from "./errors.js";
export * from "./dto/channel-dto.js";
export * from "./ports/channel-adapter-port.js";
export * from "./ports/channel-platform-ports.js";
export * from "./ports/telemetry-port.js";
export * from "./adapters/channel-adapter-registry.js";
export * from "./adapters/stub-web-chat-adapter.js";
export * from "./adapters/whatsapp/whatsapp-cloud-adapter.js";
export * from "./adapters/whatsapp/whatsapp-api-client.js";
export * from "./adapters/whatsapp/whatsapp-config.js";
export * from "./adapters/whatsapp/whatsapp-types.js";
export * from "./engines/attachment-engine.js";
export * from "./engines/channel-session-engine.js";
export * from "./engines/delivery-tracking-engine.js";
export * from "./pipelines/delivery-status-pipeline.js";
export * from "./pipelines/inbound-message-pipeline.js";
export * from "./pipelines/outbound-message-pipeline.js";
export * from "./router/channel-router.js";
export * from "./dispatcher/channel-dispatcher.js";
export * from "./repositories/channel-platform-repositories.js";
export * from "./repositories/channel-workflow-binding-repository.js";
export * from "./repositories/supabase-channel-workflow-binding-repository.js";
export * from "./services/channel-workflow-resolver.js";
export * from "./services/extract-automation-outbound.js";
export * from "./services/dispatch-automation-outbound.js";
export * from "./services/extract-automation-response.js";
export * from "./webhooks/whatsapp-webhook-handler.js";
export * from "./webhooks/whatsapp-webhook-routing.js";
export * from "./webhooks/whatsapp-phone-number-probe.js";
export * from "./adapters/whatsapp/whatsapp-canonical-credentials.js";
export * from "./adapters/whatsapp/whatsapp-outbound-health.js";
export * from "./adapters/whatsapp/whatsapp-direct-outbound-bypass.js";
export * from "./webhooks/whatsapp-company-channel.js";
export * from "./webhooks/instagram-webhook-handler.js";
export * from "./webhooks/instagram-webhook-routing.js";
export * from "./webhooks/instagram-company-channel.js";
export * from "./adapters/instagram/instagram-cloud-adapter.js";
export * from "./adapters/instagram/instagram-api-client.js";
export * from "./adapters/instagram/instagram-config.js";
export * from "./adapters/instagram/instagram-types.js";
export * from "./adapters/instagram/instagram-canonical-credentials.js";
export * from "./adapters/instagram/instagram-outbound-health.js";
export * from "./webhooks/messenger-webhook-handler.js";
export * from "./webhooks/messenger-webhook-routing.js";
export * from "./webhooks/messenger-company-channel.js";
export * from "./adapters/messenger/messenger-cloud-adapter.js";
export * from "./adapters/messenger/messenger-api-client.js";
export * from "./adapters/messenger/messenger-config.js";
export * from "./adapters/messenger/messenger-types.js";
export * from "./adapters/messenger/messenger-canonical-credentials.js";
export * from "./adapters/messenger/messenger-outbound-health.js";
export * from "./adapters/meta/meta-graph-config.js";
export * from "./adapters/meta/meta-graph-webhook.js";
export * from "./adapters/meta/meta-messaging-webhook.js";
export * from "./adapters/meta/meta-messaging-adapter.js";
export * from "./webhooks/webhook-channel-guards.js";
export * from "./debug/webhook-adapter-classification.js";
export * from "./webhooks/webhook-processing-trace.js";
export * from "./webhooks/webhook-diagnostics.js";
