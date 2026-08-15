/**
 * Phase 7.8 — in-process subscription lifecycle worker for api-server.
 * Calls run_subscription_lifecycle_enforcement_v1 via service-role Supabase client.
 * Disabled unless BILLING_LIFECYCLE_WORKER_ENABLED=true.
 * Does NOT fabricate payments or renewals.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger.js";

export type SubscriptionLifecycleWorkerHandle = {
  stop: () => void;
};

function createServiceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url?.trim() || !key?.trim()) {
    logger.warn("Billing lifecycle worker: missing SUPABASE_URL or service role key");
    return null;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function startSubscriptionLifecycleWorker(): SubscriptionLifecycleWorkerHandle | null {
  if (process.env.BILLING_LIFECYCLE_WORKER_ENABLED !== "true") {
    return null;
  }

  const intervalMs = Math.max(
    60_000,
    Number(process.env.BILLING_LIFECYCLE_WORKER_INTERVAL_MS ?? 300_000) || 300_000,
  );
  const limit = Math.max(
    1,
    Math.min(500, Number(process.env.BILLING_LIFECYCLE_WORKER_LIMIT ?? 100) || 100),
  );

  const client = createServiceClient();
  if (!client) return null;

  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const { data, error } = await client.rpc("run_subscription_lifecycle_enforcement_v1", {
        p_limit: limit,
      });
      if (error) {
        logger.warn({ err: error }, "Billing lifecycle enforcement failed");
        return;
      }
      logger.info({ result: data }, "Billing lifecycle enforcement completed");
    } catch (err) {
      logger.warn({ err }, "Billing lifecycle enforcement threw");
    } finally {
      running = false;
    }
  };

  logger.info(
    { intervalMs, limit },
    "Billing lifecycle worker started (no payment fabrication)",
  );

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
      logger.info("Billing lifecycle worker stopped");
    },
  };
}
