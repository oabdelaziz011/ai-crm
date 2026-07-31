import { Router, type IRouter } from "express";
import {
  createSupabaseMessengerCredentialsLoader,
  parseMessengerChannelReferences,
  performMessengerOutboundHealthCheck,
  resolveMessengerRuntimeConfiguration,
} from "@workspace/channel-platform";
import { requireCompanyScope, requireSupabaseAuth } from "../middleware/supabase-auth.js";
import { getWebhookPlatform } from "../platform/create-webhook-platform.js";

const router: IRouter = Router();

router.use(requireSupabaseAuth);
router.use(requireCompanyScope("companyId"));

router.post("/messenger/channel-outbound-health", async (req, res, next) => {
  try {
    const companyId = String(req.body?.companyId ?? "");
    const companyChannelId = String(req.body?.companyChannelId ?? "");
    if (!companyChannelId) {
      res.status(400).json({ error: "companyChannelId is required" });
      return;
    }

    const platform = getWebhookPlatform();
    const channel = await platform.ports.registry.getCompanyChannel(companyChannelId);
    if (!channel || channel.companyId !== companyId || channel.channelKey !== "messenger") {
      res.status(404).json({ error: "messenger_channel_not_found" });
      return;
    }

    const credentialsLoader = createSupabaseMessengerCredentialsLoader(platform.client);
    const runtimeConfig = await resolveMessengerRuntimeConfiguration(
      companyId,
      parseMessengerChannelReferences(channel.configuration),
      credentialsLoader,
    );

    const report = await performMessengerOutboundHealthCheck({
      companyId,
      runtimeConfig,
    });

    res.status(report.ok ? 200 : 502).json(report);
  } catch (error) {
    next(error);
  }
});

export default router;
