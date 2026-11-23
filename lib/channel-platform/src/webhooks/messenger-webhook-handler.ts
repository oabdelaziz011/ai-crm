import type { ChannelPlatformServices } from "../index.js";
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { ServiceContext } from "../types.js";
import { verifyMessengerWebhookChallenge } from "../adapters/messenger/messenger-api-client.js";

export type MessengerWebhookHandlerDeps = {
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

export type MessengerVerifyResult = {
  status: number;
  body: string;
  /** Safe diagnostic code only — never includes token/challenge values. */
  failReason?:
    | "missing_verify_token"
    | "match_count_zero"
    | "match_count_ambiguous"
    | "challenge_rejected"
    | "resolve_channel_failed";
  matchCount?: number;
};

export function createMessengerWebhookHandler(deps: MessengerWebhookHandlerDeps) {
  return {
    async verifyGet(query: Record<string, unknown>): Promise<MessengerVerifyResult> {
      const companyChannelId = String(query.companyChannelId ?? "");
      let channel: { companyId: string; verifyToken: string };
      try {
        channel = await deps.resolveCompanyChannel(companyChannelId);
      } catch {
        return { status: 403, body: "Forbidden", failReason: "resolve_channel_failed" };
      }
      const challenge = verifyMessengerWebhookChallenge({
        mode: readHubMode(query),
        verifyToken: readHubVerifyToken(query),
        challenge: readHubChallenge(query),
        expectedVerifyToken: channel.verifyToken,
      });

      if (!challenge) return { status: 403, body: "Forbidden", failReason: "challenge_rejected" };
      return { status: 200, body: challenge };
    },

    async verifyGetByVerifyToken(query: Record<string, unknown>): Promise<MessengerVerifyResult> {
      const hubVerifyToken = readHubVerifyToken(query);
      if (!hubVerifyToken) {
        return { status: 403, body: "Forbidden", failReason: "missing_verify_token", matchCount: 0 };
      }

      const matches = await deps.ports.registry.findCompanyChannelsByMessengerVerifyToken(hubVerifyToken);
      if (matches.length === 0) {
        return { status: 403, body: "Forbidden", failReason: "match_count_zero", matchCount: 0 };
      }
      if (matches.length !== 1) {
        return {
          status: 403,
          body: "Forbidden",
          failReason: "match_count_ambiguous",
          matchCount: matches.length,
        };
      }

      const challenge = verifyMessengerWebhookChallenge({
        mode: readHubMode(query),
        verifyToken: hubVerifyToken,
        challenge: readHubChallenge(query),
        expectedVerifyToken: hubVerifyToken,
      });

      if (!challenge) {
        return { status: 403, body: "Forbidden", failReason: "challenge_rejected", matchCount: 1 };
      }
      return { status: 200, body: challenge, matchCount: 1 };
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

      return deps.services.router.routeWebhook(ctx, {
        companyId: channel.companyId,
        companyChannelId: input.companyChannelId,
        channelKey: "messenger",
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
    },
  };
}

export { resolveMessengerCompanyChannel } from "./messenger-company-channel.js";
