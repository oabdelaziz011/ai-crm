import { Router, type IRouter } from "express";
import {
  isSalesFollowUpProviderSendAllowed,
  isSalesFollowUpWorkerEnabled,
} from "../services/sales-follow-up-worker.js";

const router: IRouter = Router();

/** Non-sensitive worker gate status for the settings UI. */
router.get("/sales-follow-up/status", (_req, res) => {
  res.json({
    workerEnabled: isSalesFollowUpWorkerEnabled(),
    allowSend: isSalesFollowUpProviderSendAllowed(),
  });
});

export default router;
