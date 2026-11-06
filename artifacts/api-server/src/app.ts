import express, { type Express } from "express";
import pinoHttp from "pino-http";
import { pool } from "@workspace/db";
import router from "./routes/index.js";
import webhooksRouter from "./routes/webhooks.js";
import smsWebhooksRouter from "./routes/sms-webhooks.js";
import publicWebChatRouter from "./routes/public-web-chat.js";
import publicCompanyBrandingRouter, {
  PUBLIC_COMPANY_BRANDING_ROUTE_PREFIX,
} from "./routes/public-company-branding.js";
import { PUBLIC_WEB_CHAT_ROUTE_PREFIX } from "./services/public-web-chat/public-web-chat-config.js";
import { logger } from "./lib/logger.js";
import { applySecurityMiddleware } from "./middleware/security.js";
import { apiCorsMiddleware } from "./middleware/cors.js";
import { globalRateLimiter } from "./middleware/rate-limit.js";
import { requestContextMiddleware } from "./middleware/request-context.js";
import { metricsMiddleware } from "./middleware/metrics.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { authEmailRedirectMiddleware } from "./middleware/auth-email-redirect.js";
import { loadPlatformEnv } from "./config/env.js";
import {
  applySharedBodyParsers,
  SMS_WEBHOOK_LIMIT,
  WEBHOOK_JSON_LIMIT,
} from "./http/body-limits.js";
import { createApiSessionMiddleware } from "./session/create-api-session.js";
import { PostgresSessionStore } from "./session/postgres-session-store.js";

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

// Twilio SMS webhooks are form-urlencoded (not JSON) and need X-Twilio-Signature over POST params.
app.use(
  "/api/webhooks/sms",
  express.urlencoded({ extended: false, limit: SMS_WEBHOOK_LIMIT }),
  smsWebhooksRouter,
);

// Other webhook routes require raw body for Meta/signature validation.
app.use(
  "/api/webhooks",
  express.raw({ type: "application/json", limit: WEBHOOK_JSON_LIMIT }),
  webhooksRouter,
);

// Public Web Chat: own body limit + CORS; outside the dashboard auth/session chain.
app.use(PUBLIC_WEB_CHAT_ROUTE_PREFIX, publicWebChatRouter);

// Local product-gallery images for WhatsApp (Meta fetches via the developer tunnel).
app.use(PUBLIC_COMPANY_BRANDING_ROUTE_PREFIX, publicCompanyBrandingRouter);

applySharedBodyParsers(app);

const sessionStore =
  env.nodeEnv === "production"
    ? new PostgresSessionStore(pool, {
        onError: (error) => logger.warn({ err: error }, "Session store prune failed"),
      })
    : undefined;
if (sessionStore) app.set("sessionStore", sessionStore);
app.use(
  createApiSessionMiddleware({
    nodeEnv: env.nodeEnv,
    sessionSecret: env.sessionSecret,
    store: sessionStore,
  }),
);

app.use("/api", router);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
