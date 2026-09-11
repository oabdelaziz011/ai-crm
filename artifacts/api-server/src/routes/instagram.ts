import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import {
  createSupabaseInstagramCredentialsLoader,
  parseInstagramChannelReferences,
  performInstagramOutboundHealthCheck,
  resolveInstagramRuntimeConfiguration,
} from "@workspace/channel-platform";
import { logger } from "../lib/logger.js";
import { HttpError } from "../middleware/error-handler.js";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";

/** Keep origin JSON+CORS ahead of Cloudflare's ~100s proxy timeout (which has no ACAO). */
export const INSTAGRAM_OUTBOUND_HEALTH_TIMEOUT_MS = 20_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isInstagramOutboundHealthPath(req: Request): boolean {
  const path = (req.originalUrl || req.url || req.path || "").split("?")[0] ?? "";
  return path.endsWith("/instagram/channel-outbound-health");
}

const router: IRouter = Router();

router.use((req: Request, res: Response, next: NextFunction) => {
  if (!isInstagramOutboundHealthPath(req) || req.method === "OPTIONS") {
    next();
    return;
  }

  const started = Date.now();
  logger.info(
    {
      instagramHealthDiag: true,
      stage: "received",
      method: req.method,
      origin: req.header("origin") ?? null,
      hasAuthorization: Boolean(req.header("authorization")),
      requestId: req.requestId,
    },
    "instagram.channel-outbound-health received",
  );

  res.on("finish", () => {
    logger.info(
      {
        instagramHealthDiag: true,
        stage: "finished",
        method: req.method,
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
        requestId: req.requestId,
      },
      "instagram.channel-outbound-health finished",
    );
  });

  next();
});

router.use(requireSupabaseAuth);
router.use(requireCompanyScope("companyId"));

router.post("/instagram/channel-outbound-health", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    const companyChannelId = String(req.body?.companyChannelId ?? "");
    if (!companyChannelId) {
      res.status(400).json({ error: "companyChannelId is required" });
      return;
    }

    const platform = getWebhookPlatform();
    const channel = await platform.ports.registry.getCompanyChannel(companyChannelId);
    if (!channel || channel.companyId !== companyId || channel.channelKey !== "instagram") {
      res.status(404).json({ error: "instagram_channel_not_found" });
      return;
    }

    const credentialsLoader = createSupabaseInstagramCredentialsLoader(platform.client);
    const runtimeConfig = await resolveInstagramRuntimeConfiguration(
      companyId,
      parseInstagramChannelReferences(channel.configuration),
      credentialsLoader,
    );

    const report = await withTimeout(
      performInstagramOutboundHealthCheck({
        companyId,
        runtimeConfig,
      }),
      INSTAGRAM_OUTBOUND_HEALTH_TIMEOUT_MS,
      () =>
        new HttpError(
          504,
          "Instagram health check timed out before Meta Graph responded.",
          "instagram_health_timeout",
        ),
    );

    res.status(report.ok ? 200 : 502).json(report);
  } catch (error) {
    next(error);
  }
});

export default router;
