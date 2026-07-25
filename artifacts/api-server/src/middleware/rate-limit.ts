import rateLimit from "express-rate-limit";
import { logger } from "../lib/logger.js";

export const globalRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limit_exceeded" },
});

export const webhookRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "webhook_rate_limit_exceeded" },
  handler: (req, res, _next, options) => {
    logger.warn(
      {
        webhookDiag: true,
        diagStage: "post.early_return",
        reason: "webhook_rate_limit_exceeded",
        httpStatus: options.statusCode,
        path: req.path,
        method: req.method,
        ip: req.ip,
      },
      "[WA-WEBHOOK-DIAG] post.early_return: webhook_rate_limit_exceeded",
    );
    res.status(options.statusCode).json(options.message);
  },
});
