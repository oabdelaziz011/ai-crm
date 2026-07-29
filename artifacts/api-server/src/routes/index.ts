import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import emailRouter from "./email.js";
import whatsappRouter from "./whatsapp.js";
import instagramRouter from "./instagram.js";
import messengerRouter from "./messenger.js";
import v1Router from "./v1/index.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(emailRouter);
router.use(whatsappRouter);
router.use(instagramRouter);
router.use(messengerRouter);
router.use("/v1", v1Router);

export default router;
