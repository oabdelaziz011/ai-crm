import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

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
    timestamp: new Date().toISOString(),
  });
});

export default router;
