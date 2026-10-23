/**
 * Background worker for due sales follow-up jobs.
 * Mirrors email-inbound-poll-worker: setInterval + non-overlapping ticks.
 *
 * Env (safe defaults — no automatic customer messaging):
 * - SALES_FOLLOW_UP_WORKER_ENABLED: default false
 * - SALES_FOLLOW_UP_WORKER_ALLOW_SEND: default false (eligibility runs; provider send blocked)
 * - SALES_FOLLOW_UP_WORKER_INTERVAL_MS: default 60000 (min 15000)
 * - SALES_FOLLOW_UP_WORKER_LIMIT: default 25 (max 100)
 */
import {
  createSupabaseSalesFollowUpAttemptStore,
  processSalesFollowUpTick,
  type SalesFollowUpEligibilitySnapshot,
  type SalesFollowUpJobRecord,
  type SalesFollowUpSettings,
} from "@workspace/automation-platform";
import { logger } from "../lib/logger.js";
import { loadSalesFollowUpEligibility } from "./sales-follow-up-eligibility.js";
import { createSalesFollowUpMessageResolver } from "./sales-follow-up-message-compose.js";

export type SalesFollowUpWorkerHandle = {
  stop: () => Promise<void> | void;
  isRunning: () => boolean;
  isStopped: () => boolean;
};

export type SalesFollowUpWorkerDeps = {
  getClient?: () => Promise<{ client: import("@supabase/supabase-js").SupabaseClient; serviceContext: import("@workspace/channel-platform").ServiceContext }>;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  loggerInfo?: typeof logger.info;
  loggerError?: typeof logger.error;
  loadEligibility?: (
    job: SalesFollowUpJobRecord,
    settings: SalesFollowUpSettings,
  ) => Promise<SalesFollowUpEligibilitySnapshot>;
};

let activeHandle: SalesFollowUpWorkerHandle | null = null;

export function isSalesFollowUpWorkerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return ["1", "true", "yes", "on"].includes(
    String(env.SALES_FOLLOW_UP_WORKER_ENABLED ?? "false").trim().toLowerCase(),
  );
}

export function isSalesFollowUpProviderSendAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return ["1", "true", "yes", "on"].includes(
    String(env.SALES_FOLLOW_UP_WORKER_ALLOW_SEND ?? "false").trim().toLowerCase(),
  );
}

export function resolveSalesFollowUpWorkerIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  return Math.max(15_000, Number(env.SALES_FOLLOW_UP_WORKER_INTERVAL_MS ?? 60_000) || 60_000);
}

export function resolveSalesFollowUpWorkerLimit(env: NodeJS.ProcessEnv = process.env): number {
  return Math.max(1, Math.min(100, Number(env.SALES_FOLLOW_UP_WORKER_LIMIT ?? 25) || 25));
}

export function __resetSalesFollowUpWorkerForTests(): void {
  activeHandle = null;
}

async function defaultGetClient() {
  const { getWebhookPlatform } = await import("../platform/create-webhook-platform.js");
  const platform = getWebhookPlatform();
  return {
    client: platform.client,
    serviceContext: {
      userId: null,
      companyId: null,
      isSuperAdmin: true,
      hasPermission: () => true,
    } as import("@workspace/channel-platform").ServiceContext,
  };
}

/** Fallback eligibility when DB context is unavailable (tests). */
export async function defaultSalesFollowUpEligibility(
  job: SalesFollowUpJobRecord,
  settings: SalesFollowUpSettings,
): Promise<SalesFollowUpEligibilitySnapshot> {
  return {
    optedOut: false,
    customerRepliedAfterSchedule: false,
    converted: false,
    purchased: false,
    requestClosed: false,
    assigneeChanged: false,
    attemptsAlreadySent: 0,
    companySentToday: 0,
    channelConnected: Boolean(job.channel && settings.channels.includes(job.channel)),
    channelCanSend: Boolean(job.companyChannelId && job.externalThreadId && job.conversationId),
    withinBusinessHours: true,
  };
}

export function startSalesFollowUpWorker(
  deps: SalesFollowUpWorkerDeps = {},
): SalesFollowUpWorkerHandle | null {
  if (!isSalesFollowUpWorkerEnabled()) {
    logger.info(
      { event: "sales.follow_up.worker.disabled" },
      "Sales follow-up worker disabled (SALES_FOLLOW_UP_WORKER_ENABLED)",
    );
    return null;
  }

  if (activeHandle && !activeHandle.isStopped()) {
    logger.info(
      { event: "sales.follow_up.worker.already_running" },
      "Sales follow-up worker already active — reusing existing instance",
    );
    return activeHandle;
  }

  const intervalMs = resolveSalesFollowUpWorkerIntervalMs();
  const limit = resolveSalesFollowUpWorkerLimit();
  const allowProviderSend = isSalesFollowUpProviderSendAllowed();
  const getClient = deps.getClient ?? defaultGetClient;
  const setTimeoutFn = deps.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = deps.clearTimeoutFn ?? clearTimeout;
  const setIntervalFn = deps.setIntervalFn ?? setInterval;
  const clearIntervalFn = deps.clearIntervalFn ?? clearInterval;
  const logInfo = deps.loggerInfo ?? logger.info.bind(logger);
  const logError = deps.loggerError ?? logger.error.bind(logger);

  let stopped = false;
  let running = false;
  let activeTick: Promise<void> | null = null;

  const tick = async () => {
    if (stopped || running) {
      logInfo(
        {
          event: "sales.follow_up.worker.tick_skipped",
          reason: stopped ? "stopped" : "overlap",
        },
        "Sales follow-up worker tick skipped",
      );
      return;
    }
    running = true;
    const work = (async () => {
      try {
        const { client, serviceContext } = await getClient();
        const { createOmnichannelSalesFollowUpDelivery } = await import(
          "./sales-follow-up-delivery.js"
        );
        const resolveEligibility =
          deps.loadEligibility ??
          ((job, settings) => loadSalesFollowUpEligibility(client, job, settings));
        const result = await processSalesFollowUpTick({
          client,
          delivery: createOmnichannelSalesFollowUpDelivery(serviceContext),
          attempts: createSupabaseSalesFollowUpAttemptStore(client),
          allowProviderSend,
          claimOwner: `sales-follow-up-worker:${process.pid}`,
          limit,
          loadEligibility: resolveEligibility,
          resolveMessage: createSalesFollowUpMessageResolver(client),
        });
        logInfo(
          {
            event: "sales.follow_up.worker.tick",
            claimed: result.claimed,
            processed: result.processed,
            delivered: result.delivered,
            failures: result.failures,
            allowProviderSend,
            intervalMs,
            limit,
          },
          "Sales follow-up worker tick completed",
        );
      } catch (error) {
        logError(
          {
            err: error instanceof Error ? { message: error.message, name: error.name } : error,
            event: "sales.follow_up.worker.error",
          },
          "Sales follow-up worker tick failed",
        );
      } finally {
        running = false;
      }
    })();
    activeTick = work;
    await work;
    if (activeTick === work) activeTick = null;
  };

  logInfo(
    { event: "sales.follow_up.worker.start", intervalMs, limit, allowProviderSend },
    "Sales follow-up worker started",
  );

  const bootTimer = setTimeoutFn(() => {
    void tick();
  }, Math.min(5_000, intervalMs));
  const timer = setIntervalFn(() => {
    void tick();
  }, intervalMs);

  if (typeof (timer as { unref?: () => void }).unref === "function") {
    (timer as { unref: () => void }).unref();
  }
  if (typeof (bootTimer as { unref?: () => void }).unref === "function") {
    (bootTimer as { unref: () => void }).unref();
  }

  const handle: SalesFollowUpWorkerHandle = {
    isRunning: () => running,
    isStopped: () => stopped,
    stop: async () => {
      stopped = true;
      clearTimeoutFn(bootTimer);
      clearIntervalFn(timer);
      if (activeTick) {
        try {
          await activeTick;
        } catch {
          // already logged
        }
      }
      if (activeHandle === handle) activeHandle = null;
      logInfo({ event: "sales.follow_up.worker.stop" }, "Sales follow-up worker stopped");
    },
  };

  activeHandle = handle;
  return handle;
}
