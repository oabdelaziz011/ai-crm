import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import emailRouter from "./email.js";
import whatsappRouter from "./whatsapp.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(emailRouter);
router.use(whatsappRouter);

export default router;
