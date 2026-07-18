import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

export default router;
