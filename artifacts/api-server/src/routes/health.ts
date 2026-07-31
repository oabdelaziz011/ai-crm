import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";
import { WEBHOOK_RUNTIME_FEATURES } from "../platform/create-webhook-automation-services.js";
import { getMetricsSnapshot } from "../middleware/metrics.js";
import { logger } from "../lib/logger.js";
import { execSync } from "node:child_process";

const router: IRouter = Router();

function readGitCommit(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return process.env.WEBHOOK_BUILD_COMMIT ?? null;
  }
}

function livenessPayload() {
  return HealthCheckResponse.parse({ status: "ok" });
}

async function readinessPayload() {
  const checks: Record<string, "ok" | "degraded" | "failed"> = {
    process: "ok",
    supabase: "failed",
    platform: "failed",
    storage: "degraded",
    aiProvider: "degraded",
    workers: "degraded",
  };

  try {
    const platform = getWebhookPlatform();
    const { error } = await platform.client.from("companies").select("id").limit(1);
    checks.supabase = error ? "failed" : "ok";
    checks.platform = error ? "failed" : "ok";

    const { error: storageError } = await platform.client.storage.listBuckets();
    checks.storage = storageError ? "degraded" : "ok";

    const { error: aiError } = await platform.client
      .from("platform_ai_providers")
      .select("id")
      .limit(1);
    checks.aiProvider = aiError ? "degraded" : "ok";
  } catch (error) {
    logger.warn({ err: error }, "Readiness check failed");
  }

  const workerFlags = {
    embeddingWorker: process.env.EMBEDDING_WORKER_ENABLED !== "false",
    notificationQueue: process.env.NOTIFICATION_WORKER_ENABLED !== "false",
  };
  checks.workers =
    workerFlags.embeddingWorker || workerFlags.notificationQueue ? "ok" : "degraded";

  const healthy = checks.supabase === "ok" && checks.platform === "ok";

  return {
    status: healthy ? "ready" : "not_ready",
    checks,
    workers: workerFlags,
    build: {
      commit: readGitCommit(),
      nodeEnv: process.env.NODE_ENV ?? "development",
    },
    webhookRuntime: WEBHOOK_RUNTIME_FEATURES,
    timestamp: new Date().toISOString(),
  };
}

router.get("/healthz", (_req, res) => {
  res.json(livenessPayload());
});

router.get("/health", (_req, res) => {
  res.json(livenessPayload());
});

router.get("/readyz", async (_req, res) => {
  const payload = await readinessPayload();
  const healthy = payload.status === "ready";
  res.status(healthy ? 200 : 503).json(payload);
});

router.get("/ready", async (_req, res) => {
  const payload = await readinessPayload();
  const healthy = payload.status === "ready";
  res.status(healthy ? 200 : 503).json(payload);
});

router.get("/status", async (_req, res) => {
  const payload = await readinessPayload();
  res.json({
    ...payload,
    metrics: getMetricsSnapshot(),
    uptimeSec: Math.round(process.uptime()),
    memory: process.memoryUsage(),
  });
});

export default router;
