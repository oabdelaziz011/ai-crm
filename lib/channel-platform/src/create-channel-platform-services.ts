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

export type WhatsAppDirectOutboundBypassOptions =
  import("./adapters/whatsapp/whatsapp-direct-outbound-bypass.js").WhatsAppDirectOutboundBypassOptions;

export type ChannelPlatformServicesOptions = {
  ports: ChannelPlatformPorts;
  adapters?: ChannelAdapterPort[];
  registerEmailAdapter?: () => ChannelAdapterPort;
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
  emailCredentialsLoader?: import("./adapters/email/email-canonical-credentials.js").EmailCredentialsLoader;
  emailOutboundDiagnostic?: (detail: Record<string, unknown>) => void;
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

  const adapters: ChannelAdapterPort[] = [
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
  ];

  if (options.registerEmailAdapter) {
    adapters.push(options.registerEmailAdapter());
  }

  if (options.adapters?.length) {
    adapters.push(...options.adapters);
  }

  const adapterRegistry = createChannelAdapterRegistry(adapters);

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
