import { Router, type IRouter } from "express";
import {
  createSupabaseInstagramCredentialsLoader,
  parseInstagramChannelReferences,
  performInstagramOutboundHealthCheck,
  resolveInstagramRuntimeConfiguration,
} from "@workspace/channel-platform";
import { requireCompanyScope } from "../middleware/supabase-auth.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";

const router: IRouter = Router();

router.post("/instagram/channel-outbound-health", requireCompanyScope, async (req, res, next) => {
  try {
    const companyId = req.companyId!;
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

    const report = await performInstagramOutboundHealthCheck({
      companyId,
      runtimeConfig,
    });

    res.status(report.ok ? 200 : 502).json(report);
  } catch (error) {
    next(error);
  }
});

export default router;
