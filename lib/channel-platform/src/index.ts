import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelAdapterPort } from "./ports/channel-adapter-port.js";
import { createChannelAdapterRegistry } from "./adapters/channel-adapter-registry.js";
import { createStubWebChatAdapter } from "./adapters/stub-web-chat-adapter.js";
import { createWhatsAppCloudAdapter } from "./adapters/whatsapp/whatsapp-cloud-adapter.js";
import { ChannelDispatcher } from "./dispatcher/channel-dispatcher.js";
import { ChannelSessionEngine } from "./engines/channel-session-engine.js";
import { DeliveryTrackingEngine } from "./engines/delivery-tracking-engine.js";
import { DeliveryStatusPipeline } from "./pipelines/delivery-status-pipeline.js";
import { InboundMessagePipeline } from "./pipelines/inbound-message-pipeline.js";
import { OutboundMessagePipeline } from "./pipelines/outbound-message-pipeline.js";
import type { ChannelPlatformPorts } from "./ports/channel-platform-ports.js";
import { NoopChannelTelemetryPort, type ChannelTelemetryPort } from "./ports/telemetry-port.js";
import { ChannelRouter } from "./router/channel-router.js";
import {
  createSupabaseChannelDeliveryEventRepository,
  createSupabaseChannelInboundEventRepository,
  createSupabaseChannelSessionRepository,
} from "./repositories/supabase-channel-repositories.js";

export type ChannelPlatformServicesOptions = {
  ports: ChannelPlatformPorts;
  adapters?: ChannelAdapterPort[];
  telemetry?: ChannelTelemetryPort;
  whatsAppFetchFn?: typeof fetch;
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
    createWhatsAppCloudAdapter({ fetchFn: options.whatsAppFetchFn }),
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
export * from "./webhooks/whatsapp-webhook-handler.js";
