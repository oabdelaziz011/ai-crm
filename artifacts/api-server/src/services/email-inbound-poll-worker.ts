/**
 * Background inbound email polling worker.
 * Mirrors session-idle-timeout-worker: setInterval + non-overlapping ticks.
 *
 * Env:
 * - EMAIL_POLL_WORKER_ENABLED: default true (set false/0/off to disable)
 * - EMAIL_POLL_WORKER_INTERVAL_MS: default 60000 (min 15000)
 * - EMAIL_POLL_WORKER_EXECUTE_AI: default false (email inbound must not auto-send unless explicitly enabled)
 *
 * At most one active process-local worker instance (duplicate start returns the same handle).
 */
import { logger } from "../lib/logger.js";

export type EmailInboundPollWorkerHandle = {
  stop: () => Promise<void> | void;
  /** Test/observability — true while a tick is executing. */
  isRunning: () => boolean;
  isStopped: () => boolean;
};

export type EmailInboundPollPlatform = {
  emailPollingWorker: {
    pollAllEnabledChannels: (input?: {
      executeAi?: boolean;
    }) => Promise<Array<{ companyChannelId: string; processed: number }>>;
  };
};

export type EmailInboundPollWorkerDeps = {
  getPlatform?: () => EmailInboundPollPlatform | Promise<EmailInboundPollPlatform>;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  loggerInfo?: typeof logger.info;
  loggerError?: typeof logger.error;
};

let activeHandle: EmailInboundPollWorkerHandle | null = null;

export function isEmailInboundPollWorkerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.EMAIL_POLL_WORKER_ENABLED;
  if (raw == null || raw.trim() === "") return true;
  return !["0", "false", "no", "off"].includes(raw.trim().toLowerCase());
}

export function resolveEmailInboundPollIntervalMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return Math.max(15_000, Number(env.EMAIL_POLL_WORKER_INTERVAL_MS ?? 60_000) || 60_000);
}

/**
 * Email inbound AI auto-send is OFF by default.
 * Opt in explicitly with EMAIL_POLL_WORKER_EXECUTE_AI=true (or 1/yes/on).
 * WhatsApp / other channels keep their own WEBHOOK_EXECUTE_AI defaults.
 */
export function resolveEmailInboundPollExecuteAi(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return ["1", "true", "yes", "on"].includes(
    String(env.EMAIL_POLL_WORKER_EXECUTE_AI ?? "false").trim().toLowerCase(),
  );
}

/** Test helper — clear process-local singleton between tests. */
export function __resetEmailInboundPollWorkerForTests(): void {
  activeHandle = null;
}

async function defaultGetPlatform(): Promise<EmailInboundPollPlatform> {
  const { getWebhookPlatform } = await import("../platform/create-webhook-platform.js");
  return getWebhookPlatform();
}

export function startEmailInboundPollWorker(
  deps: EmailInboundPollWorkerDeps = {},
): EmailInboundPollWorkerHandle | null {
  if (!isEmailInboundPollWorkerEnabled()) {
    logger.info("Email inbound poll worker disabled");
    return null;
  }

  if (activeHandle && !activeHandle.isStopped()) {
    logger.info(
      { event: "email.poll.worker.already_running" },
      "Email inbound poll worker already active — reusing existing instance",
    );
    return activeHandle;
  }

  const intervalMs = resolveEmailInboundPollIntervalMs();
  const executeAi = resolveEmailInboundPollExecuteAi();
  const getPlatform = deps.getPlatform ?? defaultGetPlatform;
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
          event: "email.poll.worker.tick_skipped",
          reason: stopped ? "stopped" : "overlap",
        },
        "Email inbound poll worker tick skipped",
      );
      return;
    }
    running = true;
    const work = (async () => {
      try {
        const platform = await getPlatform();
        const results = await platform.emailPollingWorker.pollAllEnabledChannels({
          executeAi,
        });
        const processed = results.reduce((sum, row) => sum + (row.processed ?? 0), 0);
        logInfo(
          {
            event: "email.poll.worker.tick",
            channelCount: results.length,
            processed,
            intervalMs,
            executeAi,
          },
          "Email inbound poll worker tick completed",
        );
      } catch (error) {
        logError(
          {
            err: error instanceof Error ? { message: error.message, name: error.name } : error,
            event: "email.poll.worker.error",
          },
          "Email inbound poll worker tick failed",
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
    { event: "email.poll.worker.start", intervalMs, executeAi },
    "Email inbound poll worker started",
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

  const handle: EmailInboundPollWorkerHandle = {
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
          // tick errors already logged
        }
      }
      if (activeHandle === handle) activeHandle = null;
      logInfo({ event: "email.poll.worker.stop" }, "Email inbound poll worker stopped");
    },
  };

  activeHandle = handle;
  return handle;
}
