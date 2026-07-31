import rateLimit from "express-rate-limit";
import { logger } from "../lib/logger.js";

const limiterDefaults = {
  standardHeaders: true,
  legacyHeaders: false,
} as const;

export const globalRateLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60_000,
  max: 300,
  message: { error: "rate_limit_exceeded" },
});

export const authRateLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * 60_000,
  max: 30,
  message: { error: "auth_rate_limit_exceeded" },
});

export const providerOpsRateLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60_000,
  max: 60,
  message: { error: "provider_rate_limit_exceeded" },
});

export const exportRateLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 60_000,
  max: 20,
  message: { error: "export_rate_limit_exceeded" },
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
