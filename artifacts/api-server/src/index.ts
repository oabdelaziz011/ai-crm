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
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down");
  lifecycleWorker?.stop();
  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error during shutdown");
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  logger.error({ err: error }, "Uncaught exception");
  shutdown("uncaughtException");
});
