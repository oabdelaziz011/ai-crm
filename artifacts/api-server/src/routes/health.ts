import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";
import { WEBHOOK_RUNTIME_FEATURES } from "../platform/create-webhook-automation-services.js";
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

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", async (_req, res) => {
  const checks: Record<string, "ok" | "degraded" | "failed"> = {
    process: "ok",
    supabase: "failed",
    platform: "failed",
  };

  try {
    const platform = getWebhookPlatform();
    const { error } = await platform.client.from("companies").select("id").limit(1);
    checks.supabase = error ? "failed" : "ok";
    checks.platform = error ? "failed" : "ok";
  } catch (error) {
    logger.warn({ err: error }, "Readiness check failed");
  }

  const healthy = Object.values(checks).every((value) => value === "ok");
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ready" : "not_ready",
    checks,
    build: {
      commit: readGitCommit(),
      nodeEnv: process.env.NODE_ENV ?? "development",
    },
    webhookRuntime: WEBHOOK_RUNTIME_FEATURES,
    timestamp: new Date().toISOString(),
  });
});

export default router;
