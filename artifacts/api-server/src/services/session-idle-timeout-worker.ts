/**
 * Proactive WhatsApp session idle timeout worker.
 *
 * Uses ai_assistant_settings.conversation_timeout_minutes:
 * - At 100% idle → expire automation session silently (no WhatsApp spam)
 * - Welcome is sent only on the next customer inbound after expiry
 *
 * Enabled by default. Set SESSION_IDLE_TIMEOUT_WORKER_ENABLED=false to disable.
 */
import {
  processSessionIdleTimeouts,
  type SessionIdleTimeoutTickResult,
} from "@workspace/channel-platform";
import { logger } from "../lib/logger.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";

export type SessionIdleTimeoutWorkerHandle = {
  stop: () => void;
};

export function isSessionIdleTimeoutWorkerEnabled(): boolean {
  const raw = process.env.SESSION_IDLE_TIMEOUT_WORKER_ENABLED;
  if (raw == null || raw.trim() === "") return true;
  return !["0", "false", "no", "off"].includes(raw.trim().toLowerCase());
}

export function startSessionIdleTimeoutWorker(): SessionIdleTimeoutWorkerHandle | null {
  if (!isSessionIdleTimeoutWorkerEnabled()) {
    logger.info("Session idle timeout worker disabled");
    return null;
  }

  const intervalMs = Math.max(
    15_000,
    Number(process.env.SESSION_IDLE_TIMEOUT_WORKER_INTERVAL_MS ?? 30_000) || 30_000,
  );
  const limit = Math.max(
    1,
    Math.min(500, Number(process.env.SESSION_IDLE_TIMEOUT_WORKER_LIMIT ?? 100) || 100),
  );

  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const platform = getWebhookPlatform();
      const result: SessionIdleTimeoutTickResult = await processSessionIdleTimeouts({
        client: platform.client,
        limit,
        sendWhatsAppText: async (input) => {
          await platform.channelPlatform.dispatcher.dispatch(
            {
              userId: null,
              companyId: input.companyId,
              isSuperAdmin: true,
              hasPermission: () => true,
            },
            {
              companyId: input.companyId,
              companyChannelId: input.companyChannelId,
              channelKey: "whatsapp",
              conversationId: input.conversationId,
              channelSessionId: input.channelSessionId,
              externalThreadId: input.externalThreadId,
              text: input.text,
              metadata: {
                sessionIdleTimeout: true,
                sessionIdleTimeoutKind: input.kind,
                sessionIdleTimeoutLanguage: input.language,
                automationSessionId: input.sessionId,
              },
              persistConversationMessage: true,
            },
          );
        },
        onProcessed: (detail) => {
          logger.info(
            {
              sessionId: detail.sessionId,
              companyId: detail.companyId,
              phase: detail.phase,
              language: detail.language,
            },
            "Session idle timeout action",
          );
        },
        onError: (detail) => {
          logger.warn(
            {
              err: detail.err,
              sessionId: detail.sessionId,
              companyId: detail.companyId,
              phase: detail.phase,
            },
            "Session idle timeout action failed",
          );
        },
      });

      if (result.warned > 0 || result.ended > 0 || result.errors > 0) {
        logger.info({ result }, "Session idle timeout tick completed");
      }
    } catch (err) {
      logger.warn({ err }, "Session idle timeout tick failed");
    } finally {
      running = false;
    }
  };

  logger.info({ intervalMs, limit }, "Session idle timeout worker started");
  void tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
      logger.info("Session idle timeout worker stopped");
    },
  };
}
