import { loadPlatformEnv } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { getWebhookPlatform, SYSTEM_CONTEXT } from "../platform/create-webhook-platform.js";
import { createWebhookHandoffPlatformServices } from "../platform/create-webhook-handoff-platform.js";
import { createPublicWebChatInboundPort } from "../services/public-web-chat/public-web-chat-inbound-port.js";
import { createSupabaseWebChatRateLimitStore } from "../services/public-web-chat/public-web-chat-rate-limit.js";
import { createSupabasePublicWebChatRepository } from "../services/public-web-chat/public-web-chat-repository.js";
import {
  createPublicWebChatService,
  type PublicWebChatService,
} from "../services/public-web-chat/public-web-chat-service.js";
import { createPublicWebChatRouter } from "./public-web-chat-router.js";

export { createPublicWebChatRouter } from "./public-web-chat-router.js";

let defaultService: PublicWebChatService | null = null;

function resolveDefaultPublicWebChatService(): PublicWebChatService {
  if (defaultService) return defaultService;
  const platform = getWebhookPlatform();
  const env = loadPlatformEnv();
  const { handoffService } = createWebhookHandoffPlatformServices(platform.client);
  defaultService = createPublicWebChatService({
    repository: createSupabasePublicWebChatRepository(platform.client),
    inbound: createPublicWebChatInboundPort({
      router: platform.channelPlatform.router,
      systemContext: SYSTEM_CONTEXT,
      automationGate: platform.ports.inboundAutomationGate ?? null,
      handoffService,
    }),
    rateLimit: createSupabaseWebChatRateLimitStore(platform.client),
    fingerprintSecret: process.env.WEB_CHAT_FINGERPRINT_SECRET?.trim() || env.sessionSecret,
    executeAi: env.webhookExecuteAi,
    logger,
  });
  return defaultService;
}

const publicWebChatRouter = createPublicWebChatRouter({
  resolveService: resolveDefaultPublicWebChatService,
});

export default publicWebChatRouter;
