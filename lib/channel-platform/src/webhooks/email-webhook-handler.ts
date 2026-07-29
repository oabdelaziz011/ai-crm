import type { ChannelPlatformServices } from "../index.js";
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { ServiceContext } from "../types.js";
import { EmailInboundAdapter } from "../adapters/email/email-inbound-adapter.js";
import { resolveEmailThread, type EmailThreadLookupPort } from "../adapters/email/email-thread-resolver.js";

export type EmailWebhookHandlerDeps = {
  services: ChannelPlatformServices;
  ports: ChannelPlatformPorts;
  resolveSystemContext: () => ServiceContext;
  resolveCompanyChannel: (companyChannelId: string) => Promise<{ companyId: string }>;
  resolveRuntimeConfig?: (companyId: string) => Promise<{
    providerConnectionId: string;
    aiAssistantId: string;
    knowledgeRetrieval?: {
      embeddingConnectionId: string;
      vectorStoreConnectionId: string;
      collectionId: string;
    } | null;
  } | null>;
  threadLookup: EmailThreadLookupPort;
  inboundAdapter?: EmailInboundAdapter;
};

export function createEmailWebhookHandler(deps: EmailWebhookHandlerDeps) {
  const inboundAdapter = deps.inboundAdapter ?? new EmailInboundAdapter();

  return {
    async handlePost(input: {
      companyChannelId: string;
      rawPayload: Record<string, unknown>;
      executeAi?: boolean;
      requestId?: string | null;
      trace?: import("./webhook-processing-trace.js").WebhookProcessingTrace;
    }) {
      const channel = await deps.resolveCompanyChannel(input.companyChannelId);
      const ctx = deps.resolveSystemContext();
      const runtime = deps.resolveRuntimeConfig ? await deps.resolveRuntimeConfig(channel.companyId) : null;

      input.trace?.step("webhook.handler_started", {
        companyChannelId: input.companyChannelId,
        executeAi: input.executeAi ?? Boolean(runtime),
        runtimeReady: Boolean(runtime),
      });

      const parsed = await inboundAdapter.parseStructuredInbound(input.rawPayload);
      const resolvedThread = await resolveEmailThread({
        messageId: parsed.messageId,
        inReplyTo: parsed.inReplyTo,
        references: parsed.references,
        fromEmail: parsed.from.email,
        subject: parsed.subject,
        companyChannelId: input.companyChannelId,
        lookup: deps.threadLookup,
      });

      const webhookPayload = inboundAdapter.buildWebhookPayload(parsed, resolvedThread.externalThreadId);

      input.trace?.step("webhook.email_thread_resolved", {
        externalThreadId: resolvedThread.externalThreadId,
        matchedBy: resolvedThread.matchedBy,
        matchedMessageId: resolvedThread.matchedMessageId,
      });

      return deps.services.router.routeWebhook(ctx, {
        companyId: channel.companyId,
        companyChannelId: input.companyChannelId,
        channelKey: "email",
        rawPayload: webhookPayload,
        executeAi: input.executeAi ?? Boolean(runtime),
        aiAssistantId: runtime?.aiAssistantId,
        requestId: input.requestId ?? null,
        runtimeConfig: runtime?.providerConnectionId
          ? {
              providerConnectionId: runtime.providerConnectionId,
              ...(runtime.knowledgeRetrieval ? { knowledgeRetrieval: runtime.knowledgeRetrieval } : {}),
              executionPolicy: { streaming: false },
            }
          : undefined,
        trace: input.trace,
      });
    },
  };
}

export { resolveEmailCompanyChannel } from "./email-company-channel.js";