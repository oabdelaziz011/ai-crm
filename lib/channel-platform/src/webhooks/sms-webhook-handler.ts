import type { ChannelPlatformServices } from "../index.js";
import type { ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type { ServiceContext } from "../types.js";

export type SmsWebhookHandlerDeps = {
  services: ChannelPlatformServices;
  ports: ChannelPlatformPorts;
  resolveSystemContext: () => ServiceContext;
  resolveCompanyChannel: (companyChannelId: string) => Promise<{
    companyId: string;
    channelKey: string;
  }>;
};

export function createSmsWebhookHandler(deps: SmsWebhookHandlerDeps) {
  return {
    async handlePost(input: {
      companyChannelId: string;
      rawPayload: Record<string, unknown>;
      requestId?: string | null;
      trace?: import("./webhook-processing-trace.js").WebhookProcessingTrace;
    }) {
      const channel = await deps.resolveCompanyChannel(input.companyChannelId);
      if (channel.channelKey !== "sms") {
        return { status: 404, body: { error: "sms_channel_not_found" } };
      }

      const ctx = deps.resolveSystemContext();
      const result = await deps.services.router.routeWebhook(ctx, {
        companyId: channel.companyId,
        companyChannelId: input.companyChannelId,
        channelKey: "sms",
        rawPayload: input.rawPayload,
        executeAi: false,
        requestId: input.requestId ?? null,
        trace: input.trace,
      });

      return { status: 200, body: result };
    },
  };
}
