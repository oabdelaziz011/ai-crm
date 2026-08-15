import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import emailRouter from "./email.js";
import whatsappRouter from "./whatsapp.js";
import instagramRouter from "./instagram.js";
import messengerRouter from "./messenger.js";
import emailChannelRouter from "./email-channel.js";
import omnichannelRouter from "./omnichannel.js";
import v1Router from "./v1/index.js";
import internalBillingRouter from "./internal-billing.js";
import billingSaasRouter from "./billing-saas.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(emailRouter);
router.use(whatsappRouter);
router.use(instagramRouter);
router.use(messengerRouter);
router.use(emailChannelRouter);
router.use(omnichannelRouter);
router.use("/v1", v1Router);
router.use("/internal/billing", internalBillingRouter);
router.use("/billing/saas", billingSaasRouter);

export default router;
