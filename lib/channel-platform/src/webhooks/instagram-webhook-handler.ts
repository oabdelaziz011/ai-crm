import type { ChannelPlatformServices } from "../index.js";
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { ServiceContext } from "../types.js";
import { verifyInstagramWebhookChallenge } from "../adapters/instagram/instagram-api-client.js";

export type InstagramWebhookHandlerDeps = {
  services: ChannelPlatformServices;
  ports: ChannelPlatformPorts;
  resolveSystemContext: () => ServiceContext;
  resolveCompanyChannel: (companyChannelId: string) => Promise<{
    companyId: string;
    verifyToken: string;
  }>;
  resolveRuntimeConfig?: (companyId: string) => Promise<{
    providerConnectionId: string;
    aiAssistantId: string;
    knowledgeRetrieval?: {
      embeddingConnectionId: string;
      vectorStoreConnectionId: string;
      collectionId: string;
    } | null;
  } | null>;
};

function readHubVerifyToken(query: Record<string, unknown>): string | undefined {
  return typeof query["hub.verify_token"] === "string" ? query["hub.verify_token"] : undefined;
}

function readHubMode(query: Record<string, unknown>): string | undefined {
  return typeof query["hub.mode"] === "string" ? query["hub.mode"] : undefined;
}

function readHubChallenge(query: Record<string, unknown>): string | undefined {
  return typeof query["hub.challenge"] === "string" ? query["hub.challenge"] : undefined;
}

export function createInstagramWebhookHandler(deps: InstagramWebhookHandlerDeps) {
  return {
    async verifyGet(query: Record<string, unknown>): Promise<{ status: number; body: string }> {
      const companyChannelId = String(query.companyChannelId ?? "");
      const channel = await deps.resolveCompanyChannel(companyChannelId);
      const challenge = verifyInstagramWebhookChallenge({
        mode: readHubMode(query),
        verifyToken: readHubVerifyToken(query),
        challenge: readHubChallenge(query),
        expectedVerifyToken: channel.verifyToken,
      });

      if (!challenge) return { status: 403, body: "Forbidden" };
      return { status: 200, body: challenge };
    },

    async verifyGetByVerifyToken(query: Record<string, unknown>): Promise<{ status: number; body: string }> {
      const hubVerifyToken = readHubVerifyToken(query);
      if (!hubVerifyToken) return { status: 403, body: "Forbidden" };

      const matches = await deps.ports.registry.findCompanyChannelsByInstagramVerifyToken(hubVerifyToken);
      if (matches.length !== 1) return { status: 403, body: "Forbidden" };

      const challenge = verifyInstagramWebhookChallenge({
        mode: readHubMode(query),
        verifyToken: hubVerifyToken,
        challenge: readHubChallenge(query),
        expectedVerifyToken: hubVerifyToken,
      });

      if (!challenge) return { status: 403, body: "Forbidden" };
      return { status: 200, body: challenge };
    },

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

      const response = await deps.services.router.routeWebhook(ctx, {
        companyId: channel.companyId,
        companyChannelId: input.companyChannelId,
        channelKey: "instagram",
        rawPayload: input.rawPayload,
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

      return response;
    },
  };
}

export { resolveInstagramCompanyChannel } from "./instagram-company-channel.js";
