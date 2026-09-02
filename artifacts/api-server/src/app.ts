import express, { type Express } from "express";
import pinoHttp from "pino-http";
import session from "express-session";
import router from "./routes/index.js";
import webhooksRouter from "./routes/webhooks.js";
import { logger } from "./lib/logger.js";
import { applySecurityMiddleware } from "./middleware/security.js";
import { apiCorsMiddleware } from "./middleware/cors.js";
import { globalRateLimiter } from "./middleware/rate-limit.js";
import { requestContextMiddleware } from "./middleware/request-context.js";
import { metricsMiddleware } from "./middleware/metrics.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { authEmailRedirectMiddleware } from "./middleware/auth-email-redirect.js";
import { loadPlatformEnv } from "./config/env.js";

const env = loadPlatformEnv();

const app: Express = express();

app.set("trust proxy", 1);
// CORS first so preflight always gets ACAO headers even if later middleware fails.
app.use(apiCorsMiddleware);
// Misconfigured Supabase Site URL may send recovery/invite codes to api-server:3000.
app.use(authEmailRedirectMiddleware);
applySecurityMiddleware(app);
app.use(requestContextMiddleware);
app.use(metricsMiddleware);

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.requestId ?? req.id,
    customProps: (req) => ({
      correlationId: req.correlationId,
    }),
    serializers: {
      req(req) {
        return {
          id: req.id,
          correlationId: req.correlationId,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(globalRateLimiter);

// Webhook routes require raw body for signature validation.
app.use(
  "/api/webhooks",
  express.raw({ type: "application/json", limit: "2mb" }),
  webhooksRouter,
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(
  session({
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: env.nodeEnv === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use("/api", router);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
