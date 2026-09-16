import { Router, type IRouter, type Request, type Response } from "express";
import { webhookRateLimiter } from "../middleware/rate-limit.js";
import { processSmsWebhookPost } from "./sms-webhook-post.js";

const router: IRouter = Router();

router.use(webhookRateLimiter);

router.post("/", async (req: Request, res: Response) => {
  await processSmsWebhookPost(req, res);
});

router.post("/:companyChannelId", async (req: Request, res: Response) => {
  await processSmsWebhookPost(req, res);
});

export default router;
