import { Router, type IRouter } from "express";
import {
  createSupabaseEmailCredentialsLoader,
  parseEmailChannelReferences,
  performEmailOutboundHealthCheck,
  resolveEmailRuntimeConfiguration,
} from "@workspace/channel-platform";
import { requireCompanyScope } from "../middleware/supabase-auth.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";

const router: IRouter = Router();

router.post("/email/channel-outbound-health", requireCompanyScope, async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const companyChannelId = String(req.body?.companyChannelId ?? "");
    if (!companyChannelId) {
      res.status(400).json({ error: "companyChannelId is required" });
      return;
    }

    const platform = getWebhookPlatform();
    const channel = await platform.ports.registry.getCompanyChannel(companyChannelId);
    if (!channel || channel.companyId !== companyId || channel.channelKey !== "email") {
      res.status(404).json({ error: "email_channel_not_found" });
      return;
    }

    const credentialsLoader = createSupabaseEmailCredentialsLoader(platform.client);
    const runtimeConfig = await resolveEmailRuntimeConfiguration(
      companyId,
      parseEmailChannelReferences(channel.configuration),
      credentialsLoader,
    );

    const report = await performEmailOutboundHealthCheck({
      companyId,
      runtimeConfig,
    });

    res.status(report.ok ? 200 : 502).json(report);
  } catch (error) {
    next(error);
  }
});

router.post("/email/poll", requireCompanyScope, async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const companyChannelId = String(req.body?.companyChannelId ?? "");
    if (!companyChannelId) {
      res.status(400).json({ error: "companyChannelId is required" });
      return;
    }

    const platform = getWebhookPlatform();
    const channel = await platform.ports.registry.getCompanyChannel(companyChannelId);
    if (!channel || channel.companyId !== companyId || channel.channelKey !== "email") {
      res.status(404).json({ error: "email_channel_not_found" });
      return;
    }

    const result = await platform.emailPollingWorker.pollCompanyChannel({
      companyChannelId,
      companyId,
      executeAi: req.body?.executeAi !== false,
    });

    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

export default router;
