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

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, nodeEnv: env.nodeEnv }, "Server listening");
});

function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down");
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
