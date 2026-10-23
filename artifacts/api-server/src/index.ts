import app from "./app";
import { logger } from "./lib/logger";
import { initOpenTelemetry } from "@workspace/platform-observability";
import { loadPlatformEnv } from "./config/env.js";

const env = loadPlatformEnv();
initOpenTelemetry(env.otelEndpoint);

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

let lifecycleWorker: { stop: () => void } | null = null;
let sessionIdleTimeoutWorker: { stop: () => void } | null = null;
let emailInboundPollWorker: { stop: () => void } | null = null;
let salesFollowUpWorker: { stop: () => Promise<void> | void } | null = null;
let whatsAppReplyRecoveryWorker: { stop: () => void } | null = null;

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, nodeEnv: env.nodeEnv }, "Server listening");

  // Warm webhook platform once at boot so the first inbound WhatsApp message
  // does not pay full singleton construction latency.
  void import("./platform/create-webhook-platform.js")
    .then(({ getWebhookPlatform }) => {
      getWebhookPlatform();
      logger.info("Webhook platform warmed");
    })
    .catch((warmErr) => {
      logger.warn({ err: warmErr }, "Webhook platform warm failed");
    });

  // Phase 7.8: optional subscription lifecycle worker (no payment fabrication).
  void import("./services/subscription-lifecycle-worker.js")
    .then(({ startSubscriptionLifecycleWorker }) => {
      lifecycleWorker = startSubscriptionLifecycleWorker();
    })
    .catch((workerErr) => {
      logger.warn({ err: workerErr }, "Billing lifecycle worker failed to start");
    });

  // Proactive WhatsApp idle warning (50%) + session end (100%) from AI Assistant timeout.
  void import("./services/session-idle-timeout-worker.js")
    .then(({ startSessionIdleTimeoutWorker }) => {
      sessionIdleTimeoutWorker = startSessionIdleTimeoutWorker();
    })
    .catch((workerErr) => {
      logger.warn({ err: workerErr }, "Session idle timeout worker failed to start");
    });

  // Universal email inbound poll (IMAP + Microsoft Graph) — non-overlapping ticks.
  void import("./services/email-inbound-poll-worker.js")
    .then(({ startEmailInboundPollWorker }) => {
      emailInboundPollWorker = startEmailInboundPollWorker();
    })
    .catch((workerErr) => {
      logger.warn({ err: workerErr }, "Email inbound poll worker failed to start");
    });

  // Sales follow-up due jobs — disabled unless SALES_FOLLOW_UP_WORKER_ENABLED=true.
  // Provider send stays off unless SALES_FOLLOW_UP_WORKER_ALLOW_SEND=true.
  void import("./services/sales-follow-up-worker.js")
    .then(({ startSalesFollowUpWorker }) => {
      salesFollowUpWorker = startSalesFollowUpWorker();
    })
    .catch((workerErr) => {
      logger.warn({ err: workerErr }, "Sales follow-up worker failed to start");
    });

  // Confirm-only repair for stuck WhatsApp replies. Off unless WHATSAPP_REPLY_RECOVERY_WORKER_ENABLED=true.
  // The tick never calls a provider.
  void import("./services/whatsapp-reply-recovery-worker.js")
    .then(({ startWhatsAppReplyRecoveryFromPlatform }) => {
      whatsAppReplyRecoveryWorker = startWhatsAppReplyRecoveryFromPlatform();
    })
    .catch((workerErr) => {
      logger.warn({ err: workerErr }, "WhatsApp reply recovery worker failed to start");
    });
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down");
  lifecycleWorker?.stop();
  sessionIdleTimeoutWorker?.stop();
  const stopEmail = Promise.resolve(emailInboundPollWorker?.stop()).catch((err) => {
    logger.warn({ err }, "Email inbound poll worker stop failed");
  });
  const stopFollowUp = Promise.resolve(salesFollowUpWorker?.stop()).catch((err) => {
    logger.warn({ err }, "Sales follow-up worker stop failed");
  });
  whatsAppReplyRecoveryWorker?.stop();
  void Promise.all([stopEmail, stopFollowUp]).finally(() => {
    server.close((err) => {
      if (err) {
        logger.error({ err }, "Error during shutdown");
        process.exit(1);
      }
      process.exit(0);
    });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

function isBenignImapSocketTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { message?: unknown; code?: unknown; stack?: unknown };
  const message = typeof err.message === "string" ? err.message : "";
  const code = typeof err.code === "string" ? err.code : "";
  const stack = typeof err.stack === "string" ? err.stack : "";
  if (code !== "ETIMEOUT" && message !== "Socket timeout") return false;
  return stack.includes("imapflow") || stack.includes("imap-flow");
}

process.on("uncaughtException", (error) => {
  logger.error({ err: error }, "Uncaught exception");
  // imapflow can emit late socket timeouts after logout; do not take down the API.
  if (isBenignImapSocketTimeout(error)) {
    logger.warn({ err: error }, "Ignoring benign IMAP socket timeout");
    return;
  }
  shutdown("uncaughtException");
});
