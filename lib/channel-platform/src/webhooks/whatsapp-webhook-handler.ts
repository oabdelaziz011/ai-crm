import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelPlatformServices } from "../index.js";
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { ServiceContext } from "../types.js";
import { verifyWhatsAppWebhookChallenge } from "../adapters/whatsapp/whatsapp-api-client.js";
import { CompanyChannelNotFoundError } from "../errors.js";

export type WhatsAppWebhookHandlerDeps = {
  client: SupabaseClient;
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
  } | null>;
};

export function createWhatsAppWebhookHandler(deps: WhatsAppWebhookHandlerDeps) {
  return {
    async verifyGet(query: Record<string, unknown>): Promise<{ status: number; body: string }> {
      const companyChannelId = String(query.companyChannelId ?? "");
      const channel = await deps.resolveCompanyChannel(companyChannelId);
      const challenge = verifyWhatsAppWebhookChallenge({
        mode: typeof query["hub.mode"] === "string" ? query["hub.mode"] : undefined,
        verifyToken: typeof query["hub.verify_token"] === "string" ? query["hub.verify_token"] : undefined,
        challenge: typeof query["hub.challenge"] === "string" ? query["hub.challenge"] : undefined,
        expectedVerifyToken: channel.verifyToken,
      });

      if (!challenge) return { status: 403, body: "Forbidden" };
      return { status: 200, body: challenge };
    },

    async handlePost(input: {
      companyChannelId: string;
      rawPayload: Record<string, unknown>;
      executeAi?: boolean;
    }) {
      const channel = await deps.resolveCompanyChannel(input.companyChannelId);
      const ctx = deps.resolveSystemContext();
      const runtime = deps.resolveRuntimeConfig ? await deps.resolveRuntimeConfig(channel.companyId) : null;

      const response = await deps.services.router.routeWebhook(ctx, {
        companyId: channel.companyId,
        companyChannelId: input.companyChannelId,
        channelKey: "whatsapp",
        rawPayload: input.rawPayload,
        executeAi: input.executeAi ?? Boolean(runtime),
        aiAssistantId: runtime?.aiAssistantId,
        runtimeConfig: runtime?.providerConnectionId
          ? { providerConnectionId: runtime.providerConnectionId, executionPolicy: { streaming: false } }
          : undefined,
      });

      return response;
    },
  };
}

export async function resolveWhatsAppCompanyChannel(
  ports: ChannelPlatformPorts,
  companyChannelId: string,
): Promise<{ companyId: string; verifyToken: string }> {
  const channel = await ports.registry.getCompanyChannel(companyChannelId);
  if (!channel) throw new CompanyChannelNotFoundError(companyChannelId);

  const verifyToken =
    typeof channel.configuration.verifyToken === "string" ? channel.configuration.verifyToken : "";
  if (!verifyToken) {
    throw new Error("WhatsApp verifyToken is not configured for this company channel.");
  }

  return { companyId: channel.companyId, verifyToken };
}
