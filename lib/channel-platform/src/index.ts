import type { SupabaseClient } from "@supabase/supabase-js";
import { createEmailCloudAdapter } from "./adapters/email/email-cloud-adapter.js";
import {
  createChannelPlatformServices,
  type ChannelPlatformServices,
  type ChannelPlatformServicesOptions,
  type WhatsAppDirectOutboundBypassOptions,
} from "./create-channel-platform-services.js";

export {
  createChannelPlatformServices,
  type ChannelPlatformServices,
  type ChannelPlatformServicesOptions,
  type WhatsAppDirectOutboundBypassOptions,
} from "./create-channel-platform-services.js";

/** Server-side factory helper that registers the email adapter. */
export function createServerChannelPlatformServices(
  client: SupabaseClient,
  options: ChannelPlatformServicesOptions,
): ChannelPlatformServices {
  return createChannelPlatformServices(client, {
    ...options,
    registerEmailAdapter: () =>
      createEmailCloudAdapter({
        credentialsLoader: options.emailCredentialsLoader,
        onOutboundDiagnostic: options.emailOutboundDiagnostic,
      }),
  });
}

export * from "./constants.js";
export * from "./types.js";
export * from "./errors.js";
export * from "./dto/channel-dto.js";
export * from "./ports/campaign-delivery-reconcile-port.js";
export * from "./ports/channel-adapter-port.js";
export * from "./ports/channel-platform-ports.js";
export * from "./ports/email-routing-classifier-port.js";
export * from "./ports/email-routing-ticket-action-port.js";
export * from "./ports/ai-email-routing-commercial-port.js";
export * from "./ports/ai-employee-email-commercial-port.js";
export * from "./ports/whatsapp-messages-commercial-port.js";
export * from "./ports/emails-sent-commercial-port.js";
export * from "./ports/channel-commercial-entitlement-port.js";
export * from "./services/assert-channel-commercial-access.js";
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
export * from "./services/outbound-route-validation.js";
export * from "./services/server-outbound-channels.js";
export * from "./webhooks/whatsapp-webhook-handler.js";
export * from "./webhooks/whatsapp-webhook-routing.js";
export * from "./webhooks/whatsapp-phone-number-probe.js";
export * from "./adapters/whatsapp/whatsapp-canonical-credentials.js";
export * from "./adapters/whatsapp/whatsapp-outbound-health.js";
export * from "./adapters/whatsapp/whatsapp-credential-lifecycle.js";
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
export * from "./adapters/email/email-cloud-adapter.js";
export * from "./adapters/email/email-inbound-adapter.js";
export * from "./adapters/email/email-smtp-client.js";
export * from "./adapters/email/email-imap-client.js";
export * from "./adapters/email/email-canonical-credentials.js";
export * from "./adapters/email/email-config.js";
export * from "./adapters/email/email-types.js";
export * from "./adapters/email/email-outbound-health.js";
export * from "./adapters/email/email-thread-resolver.js";
export * from "./adapters/email/email-thread-lookup.js";
export * from "./adapters/email/email-html-utils.js";
export * from "./adapters/email/email-security.js";
export * from "./webhooks/email-webhook-handler.js";
export * from "./webhooks/email-webhook-routing.js";
export * from "./webhooks/email-company-channel.js";
export * from "./workers/email-polling-worker.js";
export * from "./adapters/meta/meta-graph-config.js";
export * from "./adapters/meta/meta-graph-webhook.js";
export * from "./adapters/meta/meta-messaging-webhook.js";
export * from "./adapters/meta/meta-messaging-adapter.js";
export * from "./webhooks/webhook-channel-guards.js";
export * from "./debug/webhook-adapter-classification.js";
export * from "./debug/whatsapp-pipeline-perf.js";
export * from "./debug/whatsapp-request-scope.js";
export * from "./debug/whatsapp-conversation-trace-bridge.js";
export * from "./webhooks/webhook-processing-trace.js";
export * from "./webhooks/webhook-diagnostics.js";
