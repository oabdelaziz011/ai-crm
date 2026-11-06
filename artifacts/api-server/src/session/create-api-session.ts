import type { RequestHandler } from "express";
import session from "express-session";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cookie session for the legacy username login.
 * Production must receive the Postgres store. The default in-memory store is development only.
 * SameSite=Lax, HttpOnly, and Secure in production are unchanged.
 * Dashboard company isolation remains the Supabase bearer token, not this cookie.
 */
export function createApiSessionMiddleware(options: {
  nodeEnv: string;
  sessionSecret: string;
  store?: session.Store;
}): RequestHandler {
  const production = options.nodeEnv === "production";
  if (production && !options.store) {
    throw new Error("Production requires the PostgreSQL session store.");
  }

  return session({
    store: options.store,
    name: "connect.sid",
    secret: options.sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: production,
    cookie: {
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      maxAge: SEVEN_DAYS_MS,
    },
  });
}
