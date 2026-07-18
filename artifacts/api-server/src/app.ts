import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import router from "./routes/index.js";
import webhooksRouter from "./routes/webhooks.js";
import { logger } from "./lib/logger.js";
import { applySecurityMiddleware } from "./middleware/security.js";
import { globalRateLimiter } from "./middleware/rate-limit.js";
import { loadPlatformEnv } from "./config/env.js";

const env = loadPlatformEnv();

const app: Express = express();

applySecurityMiddleware(app);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
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

app.use(cors({ origin: true, credentials: true }));
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

export default app;
